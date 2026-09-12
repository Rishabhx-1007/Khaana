/* ============================================================
   KHAANA — calls our own Netlify function (netlify/functions/analyze.js)
   ============================================================ */
let currentImageBase64 = null;
let currentImageType = "image/jpeg";
let currentResult = null;

const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
const uploadIntro = document.getElementById('uploadIntro');
const previewBox = document.getElementById('previewBox');
const previewActions = document.getElementById('previewActions');
const previewImg = document.getElementById('previewImg');
const loadingState = document.getElementById('loadingState');
const resultsCard = document.getElementById('resultsCard');
const errorCard = document.getElementById('errorCard');
const mealDescription = document.getElementById('mealDescription');

cameraInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
galleryInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  const reader = new FileReader();
  currentImageType = file.type || "image/jpeg";
  reader.onload = e => {
    currentImageBase64 = e.target.result.split(',')[1];
    previewImg.src = e.target.result;
    uploadIntro.style.display = 'none';
    previewBox.style.display = 'block';
    previewActions.style.display = 'flex';
    resultsCard.style.display = 'none';
    errorCard.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function resetAll() {
  uploadIntro.style.display = 'block';
  previewBox.style.display = 'none';
  loadingState.style.display = 'none';
  resultsCard.style.display = 'none';
  errorCard.style.display = 'none';
  cameraInput.value = '';
  galleryInput.value = '';
  mealDescription.value = '';
  currentImageBase64 = null;
}

/* ============================================================
   NAME — optional, just for a friendly greeting
   ============================================================ */
function loadUserName() { return localStorage.getItem('khaanaUserName') || ''; }

function renderGreeting() {
  const name = loadUserName();
  const el = document.getElementById('greetingText');
  el.innerHTML = name
    ? `Hi, ${name} <button class="name-edit-link" onclick="editUserName()">✎</button>`
    : `<button class="name-edit-link" onclick="editUserName()">+ Add your name</button>`;
}

function editUserName() {
  const current = loadUserName();
  const name = window.prompt("What should we call you? (optional)", current);
  if (name !== null) {
    localStorage.setItem('khaanaUserName', name.trim());
    renderGreeting();
  }
}

/* ============================================================
   STREAKS
   ============================================================ */
function loadStreak() {
  const raw = localStorage.getItem('khaanaStreak');
  return raw ? JSON.parse(raw) : { count: 0, lastLoggedDate: null };
}
function saveStreak(s) { localStorage.setItem('khaanaStreak', JSON.stringify(s)); }

function updateStreakOnLog() {
  const streak = loadStreak();
  const today = new Date().toISOString().slice(0, 10);
  if (streak.lastLoggedDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  streak.count = (streak.lastLoggedDate === yesterday.toISOString().slice(0, 10)) ? streak.count + 1 : 1;
  streak.lastLoggedDate = today;
  saveStreak(streak);
}

function renderStreak() {
  const streak = loadStreak();
  document.getElementById('streakCount').textContent = streak.count;
  document.getElementById('streakBadge').style.display = 'inline-flex';
}

/* ============================================================
   TODAY'S LOG — persisted in localStorage (per-day key)
   ============================================================ */
function getTodayKey() { return `khaanaLog_${new Date().toISOString().slice(0, 10)}`; }
function loadTodayLog() { const raw = localStorage.getItem(getTodayKey()); return raw ? JSON.parse(raw) : []; }
function saveTodayLog(entries) { localStorage.setItem(getTodayKey(), JSON.stringify(entries)); }

function renderTodayLog() {
  const entries = loadTodayLog();
  const logList = document.getElementById('logList');
  const logEmpty = document.getElementById('logEmpty');

  document.getElementById('logDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('logTotalCals').textContent = entries.reduce((sum, e) => sum + e.calories, 0);

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
      <button class="log-row-remove" onclick="removeLogEntry(${index})" aria-label="Remove">✕</button>
    `;
    logList.appendChild(row);
  });
}

function addToLog() {
  if (!currentResult || !currentResult.items) return;
  const calories = currentResult.items.reduce((sum, i) => sum + i.quantity * i.caloriesPerUnit, 0);

  const entries = loadTodayLog();
  entries.push({
    title: currentResult.title,
    calories: Math.round(calories),
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  });
  saveTodayLog(entries);
  updateStreakOnLog();
  renderTodayLog();
  renderStreak();

  const btn = document.getElementById('addToLogBtn');
  const originalText = btn.textContent;
  btn.textContent = 'Added ✓';
  btn.disabled = true;
  setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 1500);
}

function removeLogEntry(index) {
  const entries = loadTodayLog();
  entries.splice(index, 1);
  saveTodayLog(entries);
  renderTodayLog();
}

/* ============================================================
   ANALYSIS — calls our serverless function
   ============================================================ */
async function getEstimateFromGroqVision(base64Image, mimeType, description) {
  const response = await fetch("/.netlify/functions/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Image, mimeType, description })
  });
  const result = await response.json();
  console.log("Analyze function response:", result);
  if (result.error) throw new Error(result.error);
  return result;
}

async function analyzeFood() {
  if (!currentImageBase64) return;

  previewActions.style.display = 'none';
  loadingState.style.display = 'block';
  resultsCard.style.display = 'none';
  errorCard.style.display = 'none';

  try {
    const description = mealDescription.value.trim();
    const result = await getEstimateFromGroqVision(currentImageBase64, currentImageType, description);
    loadingState.style.display = 'none';

    if (!result || !result.items || result.items.length === 0) {
      errorCard.style.display = 'block';
      document.getElementById('errorMsg').textContent = "We couldn't identify a dish in this photo. Try a clearer, closer shot with good lighting.";
      previewActions.style.display = 'flex';
      return;
    }
    renderResult(result);
  } catch (err) {
    console.error("analyzeFood failed:", err);
    loadingState.style.display = 'none';
    previewActions.style.display = 'flex';
    errorCard.style.display = 'block';
    document.getElementById('errorMsg').textContent = "Something went wrong while analysing this photo. Please try again in a moment.";
  }
}

/* ============================================================
   RESULT RENDERING — rings for calories + each macro, editable item names
   ============================================================ */
function setRingFill(id, percent, circumference) {
  const el = document.getElementById(id);
  el.style.strokeDasharray = circumference;
  el.style.strokeDashoffset = circumference * (1 - Math.min(100, percent) / 100);
}

function renderResult(result) {
  currentResult = result;
  document.getElementById('dishTitle').textContent = result.title;
  document.getElementById('dishSubtitle').textContent = result.subtitle;
  document.getElementById('noteText').innerHTML = result.note;
  renderDishList();
  recomputeAndRenderTotals();
  resultsCard.style.display = 'block';
}

function recomputeAndRenderTotals() {
  const items = currentResult.items || [];
  const totalCalories = items.reduce((s, i) => s + i.quantity * i.caloriesPerUnit, 0);
  const carbs = items.reduce((s, i) => s + i.quantity * i.carbsPerUnit, 0);
  const protein = items.reduce((s, i) => s + i.quantity * i.proteinPerUnit, 0);
  const fat = items.reduce((s, i) => s + i.quantity * i.fatPerUnit, 0);

  document.getElementById('totalCals').textContent = Math.round(totalCalories);
  document.getElementById('calRange').innerHTML = `Range: ${Math.round(totalCalories * 0.9)}–${Math.round(totalCalories * 1.1)} kcal`;
  document.getElementById('carbs').textContent = `${Math.round(carbs)}g`;
  document.getElementById('protein').textContent = `${Math.round(protein)}g`;
  document.getElementById('fat').textContent = `${Math.round(fat)}g`;

  // Decorative full ring around the total (not tied to a goal yet)
  setRingFill('calorieRing', 100, 226);

  // Each macro ring shows its share of total calories (carbs/protein = 4 kcal/g, fat = 9 kcal/g)
  const carbsKcal = carbs * 4, proteinKcal = protein * 4, fatKcal = fat * 9;
  const macroTotal = carbsKcal + proteinKcal + fatKcal || 1;
  setRingFill('carbsBar', (carbsKcal / macroTotal) * 100, 151);
  setRingFill('proteinBar', (proteinKcal / macroTotal) * 100, 151);
  setRingFill('fatBar', (fatKcal / macroTotal) * 100, 151);
}

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
            <path d="M4 11a8 8 0 0 0 16 0Z"/><path d="M4 11h16"/>
          </svg>
        </div>
        <div>
          <div class="dish-name">${item.name}</div>
          <div class="dish-portion">${item.unitLabel}</div>
        </div>
      </div>
      <button class="edit-btn" onclick="fixItemName(${index})" aria-label="Fix this item's name">✎</button>
      <div class="stepper">
        <button class="stepper-btn" onclick="changeQuantity(${index}, -1)" aria-label="Decrease">−</button>
        <span class="stepper-value">${item.quantity}</span>
        <button class="stepper-btn" onclick="changeQuantity(${index}, 1)" aria-label="Increase">+</button>
      </div>
      <div class="dish-cal">${Math.round(item.quantity * item.caloriesPerUnit)} kcal</div>
    `;
    dishList.appendChild(row);
  });
}

function changeQuantity(index, delta) {
  const item = currentResult.items[index];
  item.quantity = Math.max(0, item.quantity + delta);
  renderDishList();
  recomputeAndRenderTotals();
}

// Fixes just the displayed name (calories/macros usually still roughly hold, per real testing)
function fixItemName(index) {
  const item = currentResult.items[index];
  const newName = window.prompt("What is this actually?", item.name);
  if (newName && newName.trim()) {
    item.name = newName.trim();
    renderDishList();
  }
}

// Initial render on page load
renderGreeting();
renderTodayLog();
renderStreak();
