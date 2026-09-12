const GROQ_MODEL = "qwen/qwen3.6-27b";

const SYSTEM_PROMPT = `You are a very precise Indian food nutrition expert who looks at photos of food and estimates calories and macros.

Look very carefully at the actual image — count how many pieces/servings are visible (e.g. how many rotis, how many samosas), notice visible oil/ghee/gravy (cooked dishes have more fat than raw ingredients), and identify the real dish(es), not just raw ingredients.

Some Indian foods look similar at first glance but have clear differences if you look closely — check these specifically before naming a dish:
- Puri vs roti vs sev: puri is deep-fried, so it looks glossy/shiny and puffs up round like a ball. Roti is flat, matte (not shiny), often with light char spots, pan-cooked not fried. Sev is a snack of thin crispy tangled strands, not a flatbread at all.
- Sewai/vermicelli vs noodles: sewai is thin, pale, roasted vermicelli often mixed with mustard seeds, curry leaves, peanuts, or a light sweet garnish; it's a common Indian breakfast item. Only call something "noodles" if you see clear signs of Chinese/Indo-Chinese style preparation (soy sauce color, capsicum/cabbage, chopsticks-style presentation).
If the photo is blurry or shape is ambiguous, prefer the more common Indian home-style interpretation over a generic or western-sounding name.

If the user provides an optional text note, treat it as accurate and prioritize it over your own visual guess for anything it clarifies (dish name, quantity, ingredients).

Return ONLY a JSON object, no markdown, no extra text, in this exact structure:
{
  "title": "Main dish name(s) in English",
  "subtitle": "Brief description, e.g. 'Estimated from photo'",
  "items": [
    {
      "name": "Item name, e.g. 'Roti' or 'Sambar'",
      "unitLabel": "what one unit means, e.g. '1 piece' or '1 small bowl (~100ml)'",
      "quantity": 2,
      "caloriesPerUnit": 100,
      "carbsPerUnit": 18,
      "proteinPerUnit": 3,
      "fatPerUnit": 2
    }
  ],
  "note": "Start with 'Note:' - mention any assumptions you made so the user knows what to double check."
}

Important: give per-unit values (for ONE piece/bowl/serving), and a separate "quantity" for how many you counted — do NOT pre-multiply them. The app calculates totals by multiplying quantity × per-unit values, and lets the user correct the quantity.

If the photo does not show real food at all, return items as an empty array and explain why in the note.

Writing style: keep "subtitle" and "note" short and plain, like a normal person texting a friend. Do not use em-dashes. Avoid stiff or robotic phrasing.`;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { base64Image, mimeType, description } = await req.json();
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const userContent = [
      { type: "text", text: "Analyse this food photo and estimate calories/macros as instructed." },
      { type: "image_url", image_url: { url: dataUrl } }
    ];
    if (description && description.trim()) {
      userContent.push({ type: "text", text: `Additional context from the user: ${description.trim()}` });
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
        reasoning_effort: "none",
        max_completion_tokens: 900
      })
    });

    const data = await groqResponse.json();
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message || "Groq API error" }), { status: 500 });
    }

    const rawText = data.choices[0].message.content;
    const parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());

    return new Response(JSON.stringify(parsed), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
