// Integración con la API de Gemini (Google) para los highlights del panel.
// Llamada REST directa (sin el SDK @google/genai) -- mismo criterio que culqi.ts
// y el envío de WhatsApp: una dependencia menos para algo tan simple como un POST.
// Referencia: https://ai.google.dev/api/generate-content
const MODELO = "gemini-3.5-flash-lite";
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

// Solo se le manda a Gemini el resumen YA CALCULADO (ventas, costos, rankings),
// nunca los registros crudos del negocio -- ver resumenParaIA en reportes.ts.
export async function generarHighlights(resumenDatos: string): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY");

  const prompt = `Eres un asistente que ayuda a dueños de pequeños negocios peruanos a entender sus datos de ventas.
Te doy un resumen YA CALCULADO de los módulos de su negocio. No inventes números que no estén ahí.
Dame entre 3 y 5 puntos breves (máximo 20 palabras cada uno) en español neutro de Perú, tono cercano, sin
tecnicismos. Destaca lo más importante: tendencias, qué producto o cliente resalta, alguna alerta si algo
se ve bajo o una meta está lejos de cumplirse. Un punto por línea, sin numerarlos, sin viñetas ni markdown.

Datos:
${resumenDatos}`;

  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`Gemini respondió ${res.status}: ${cuerpo.slice(0, 300)}`);
  }

  const data = await res.json();
  const texto: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return texto
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean);
}
