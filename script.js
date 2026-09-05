/* ============================================================
   KHAANA — calls our own Netlify function (netlify/functions/analyze.js),
   which securely holds the Groq API key server-side.
   No API key lives in this file anymore.
   ============================================================ */

/* ============================================================
   DOM ELEMENTS
   ============================================================ */
let currentImageBase64 = null;
let currentImageType = "image/jpeg";

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const previewBox = document.getElementById('previewBox');
const previewActions = document.getElementById('previewActions');
const previewImg = document.getElementById('previewImg');
const loadingState = document.getElementById('loadingState');
const resultsCard = document.getElementById('resultsCard');
const errorCard = document.getElementById('errorCard');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFile(file);
});

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

function handleFile(file) {
  const reader = new FileReader();
  currentImageType = file.type || "image/jpeg";
  reader.onload = e => {
    const dataUrl = e.target.result;
    currentImageBase64 = dataUrl.split(',')[1];
    previewImg.src = dataUrl;
    dropZone.style.display = 'none';
    previewBox.style.display = 'block';
    previewActions.style.display = 'flex';
    resultsCard.style.display = 'none';
    errorCard.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function resetAll() {
  dropZone.style.display = 'block';
  previewBox.style.display = 'none';
  loadingState.style.display = 'none';
  resultsCard.style.display = 'none';
  errorCard.style.display = 'none';
  fileInput.value = '';
  currentImageBase64 = null;
}

/* ============================================================
   TODAY'S LOG — persisted in localStorage, so it survives
   page refreshes and closing/reopening Chrome.
   Each day gets its own storage key, so logs don't mix across days.
   ============================================================ */
function getTodayKey() {
  const today = new Date().toISOString().slice(0, 10); // e.g. "2026-08-23"
  return `khaanaLog_${today}`;
}

function loadTodayLog() {
  const raw = localStorage.getItem(getTodayKey());
  return raw ? JSON.parse(raw) : [];
}

function saveTodayLog(entries) {
  localStorage.setItem(getTodayKey(), JSON.stringify(entries));
}

function renderTodayLog() {
  const entries = loadTodayLog();
  const logList = document.getElementById('logList');
  const logEmpty = document.getElementById('logEmpty');

  document.getElementById('logDate').textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  const totalCals = entries.reduce((sum, e) => sum + e.calories, 0);
  document.getElementById('logTotalCals').textContent = totalCals;

  logList.innerHTML = '';

  if (entries.length === 0) {
    logList.appendChild(logEmpty);
    logEmpty.style.display = 'block';
    return;
  }

  entries.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `
      <div class="log-row-left">
        <div class="log-row-name">${entry.title}</div>
        <div class="log-row-time">${entry.time}</div>
      </div>
      <div class="log-row-cal">${entry.calories} kcal</div>
      <button class="log-row-remove" onclick="removeLogEntry(${index})" aria-label="Remove from log">✕</button>
    `;
    logList.appendChild(row);
  });
}

/* Adds the currently analysed + adjusted meal to today's log */
function addToLog() {
  if (!currentResult || !currentResult.items) return;

  const items = currentResult.items;
  const calories = items.reduce((sum, i) => sum + i.quantity * i.caloriesPerUnit, 0);

  const entries = loadTodayLog();
  entries.push({
    title: currentResult.title,
    calories: Math.round(calories),
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  });
  saveTodayLog(entries);
  renderTodayLog();

  // Quick visual confirmation on the button itself
  const btn = document.getElementById('addToLogBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Added ✓';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = originalText;
    btn.disabled = false;
  }, 1500);
}

function removeLogEntry(index) {
  const entries = loadTodayLog();
  entries.splice(index, 1);
  saveTodayLog(entries);
  renderTodayLog();
}

// Draw today's log as soon as the page loads
renderTodayLog();

/* ============================================================
   Ask our own serverless function to analyse the photo.
   The function holds the Groq key and prompt — we just send the image.
   ============================================================ */
async function getEstimateFromGroqVision(base64Image, mimeType) {
  const response = await fetch("/.netlify/functions/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Image, mimeType })
  });

  const result = await response.json();
  console.log("Analyze function response:", result);

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

/* ============================================================
   Holds the currently displayed result so stepper taps can
   recompute and re-render without another API call.
   ============================================================ */
let currentResult = null;

function renderResult(result) {
  currentResult = result;

  document.getElementById('dishTitle').textContent = result.title;
  document.getElementById('dishSubtitle').textContent = result.subtitle;
  document.getElementById('noteText').innerHTML = result.note;

  renderDishList();
  recomputeAndRenderTotals();

  resultsCard.style.display = 'block';
}

/* Recalculates total calories/macros from each item's quantity × per-unit values */
function recomputeAndRenderTotals() {
  const items = currentResult.items || [];
  const totalCalories = items.reduce((sum, item) => sum + item.quantity * item.caloriesPerUnit, 0);
  const carbs = items.reduce((sum, item) => sum + item.quantity * item.carbsPerUnit, 0);
  const protein = items.reduce((sum, item) => sum + item.quantity * item.proteinPerUnit, 0);
  const fat = items.reduce((sum, item) => sum + item.quantity * item.fatPerUnit, 0);
  const lowRange = Math.round(totalCalories * 0.9);
  const highRange = Math.round(totalCalories * 1.1);

  document.getElementById('totalCals').textContent = Math.round(totalCalories);
  document.getElementById('calRange').innerHTML = `Range: ${lowRange}–${highRange} kcal`;
  document.getElementById('carbs').textContent = `${Math.round(carbs)}g`;
  document.getElementById('protein').textContent = `${Math.round(protein)}g`;
  document.getElementById('fat').textContent = `${Math.round(fat)}g`;

  // Each bar's width shows that macro's share of total calories (carbs/protein = 4 kcal/g, fat = 9 kcal/g)
  const carbsKcal = carbs * 4;
  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const macroKcalTotal = carbsKcal + proteinKcal + fatKcal || 1;

  document.getElementById('carbsBar').style.width = `${(carbsKcal / macroKcalTotal) * 100}%`;
  document.getElementById('proteinBar').style.width = `${(proteinKcal / macroKcalTotal) * 100}%`;
  document.getElementById('fatBar').style.width = `${(fatKcal / macroKcalTotal) * 100}%`;
}

/* Draws each item row with a quantity stepper */
function renderDishList() {
  const dishList = document.getElementById('dishList');
  dishList.innerHTML = '';

  (currentResult.items || []).forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'dish-row';
    row.innerHTML = `
      <div class="dish-left">
        <div class="dish-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 11a8 8 0 0 0 16 0Z"/>
            <path d="M4 11h16"/>
          </svg>
        </div>
        <div>
          <div class="dish-name">${item.name}</div>
          <div class="dish-portion">${item.unitLabel}</div>
        </div>
      </div>
      <div class="stepper">
        <button class="stepper-btn" onclick="changeQuantity(${index}, -1)" aria-label="Decrease quantity">−</button>
        <span class="stepper-value">${item.quantity}</span>
        <button class="stepper-btn" onclick="changeQuantity(${index}, 1)" aria-label="Increase quantity">+</button>
      </div>
      <div class="dish-cal">${Math.round(item.quantity * item.caloriesPerUnit)} kcal</div>
    `;
    dishList.appendChild(row);
  });
}

/* Called when the user taps a +/- stepper button */
function changeQuantity(itemIndex, delta) {
  const item = currentResult.items[itemIndex];
  item.quantity = Math.max(0, item.quantity + delta);
  renderDishList();
  recomputeAndRenderTotals();
}

/* ============================================================
   MAIN FLOW
   ============================================================ */
async function analyzeFood() {
  if (!currentImageBase64) return;

  // Keep the photo visible — just hide the Analyse/Change buttons,
  // since the results card brings its own buttons once results are shown.
  previewActions.style.display = 'none';
  loadingState.style.display = 'block';
  resultsCard.style.display = 'none';
  errorCard.style.display = 'none';

  try {
    const result = await getEstimateFromGroqVision(currentImageBase64, currentImageType);

    loadingState.style.display = 'none';

    if (!result || !result.items || result.items.length === 0) {
      errorCard.style.display = 'block';
      document.getElementById('errorMsg').textContent =
        "We couldn't identify a dish in this photo. Try a clearer, closer shot with good lighting.";
      previewActions.style.display = 'flex';
      return;
    }

    renderResult(result);

  } catch (err) {
    // Technical detail stays in the console for debugging — the user
    // only ever sees a plain, friendly message.
    console.error("analyzeFood failed:", err);
    loadingState.style.display = 'none';
    previewActions.style.display = 'flex';
    errorCard.style.display = 'block';
    document.getElementById('errorMsg').textContent =
      "Something went wrong while analysing this photo. Please try again in a moment.";
  }
}
