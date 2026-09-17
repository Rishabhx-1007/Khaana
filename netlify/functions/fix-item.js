const GROQ_MODEL = "qwen/qwen3.8-27b";

const SYSTEM_PROMPT = `You are an Indian food nutrition expert. Given the name of a single food item, return typical per-unit calories and macros for one standard serving or piece.

Return ONLY a JSON object, no markdown, no extra text, in this exact structure:
{
  "unitLabel": "what one unit means, e.g. '1 piece' or '1 small bowl (~100ml)'",
  "caloriesPerUnit": 100,
  "carbsPerUnit": 18,
  "proteinPerUnit": 3,
  "fatPerUnit": 2
}`;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { name } = await req.json();
    if (!name || !name.trim()) {
      return new Response(JSON.stringify({ error: "No name provided" }), { status: 400 });
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Food item: ${name.trim()}` }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
        reasoning_effort: "none",
        max_completion_tokens: 200
      })
    });

    const data = await groqResponse.json();
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message || "Groq API error" }), { status: 500 });
    }

    const parsed = JSON.parse(data.choices[0].message.content.replace(/```json|```/g, "").trim());
    return new Response(JSON.stringify(parsed), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
