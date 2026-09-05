/* ============================================================
   This function runs on Netlify's server, NOT in the visitor's
   browser. That's why it's safe to use the real Groq API key here
   — it's read from an environment variable, never sent to the client.
   ============================================================ */

const GROQ_MODEL = "qwen/qwen3.6-27b";

const SYSTEM_PROMPT = `You are a very precise Indian food nutrition expert who looks at photos of food and estimates calories and macros.

Look carefully at the actual image — count how many pieces/servings are visible (e.g. how many rotis, how many samosas), notice visible oil/ghee/gravy (cooked dishes have more fat than raw ingredients), and identify the real dish(es), not just raw ingredients.

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
  "note": "Start with 'Note:' - mention any assumptions you made (portion size, oil quantity, hidden ingredients you couldn't see) so the user knows what to double check."
}

Important: give per-unit values (for ONE piece/bowl/serving), and a separate "quantity" for how many you counted in the photo — do NOT pre-multiply them together. The app will calculate totals by multiplying quantity × per-unit values, and lets the user correct the quantity if your count is off, so accurate per-unit values matter more than the total.

If the photo does not show real food at all, return items as an empty array and explain why in the note.`;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { base64Image, mimeType } = await req.json();
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyse this food photo and estimate calories/macros as instructed." },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
        reasoning_effort: "none",
        max_completion_tokens: 2048
      })
    });

    const data = await groqResponse.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message || "Groq API error" }), { status: 500 });
    }

    // Send back only the parsed dish JSON — the frontend never needs to see
    // Groq's raw response shape or any key-related details.
    const rawText = data.choices[0].message.content;
    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
