// Integración con la API de Gemini (Google) para los highlights del panel.
// Llamada REST directa (sin el SDK @google/genai) -- mismo criterio que culqi.ts
// y el envío de WhatsApp: una dependencia menos para algo tan simple como un POST.
// Referencia: https://ai.google.dev/api/generate-content
const MODELO = "gemini-3.5-flash-lite";
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

// Lo que entra en resumenDatos ya salió filtrado de datosReportes.ts: solo agregados
// (ventas, costos, rankings, % de columnas libres como edad o zona) -- nunca una fila
// ni un nombre de cliente/teléfono (ver resumenConLibresParaIA). Como ya no se manda
// texto crudo, el prompt le puede pedir un reporte más largo sin disparar el consumo
// de tokens de entrada; el límite de salida (maxOutputTokens) es lo único que lo acota.
export async function generarHighlights(resumenDatos: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY");

  const prompt = `Eres un asistente que ayuda a dueños de pequeños negocios peruanos a entender sus datos de ventas.
Te doy un resumen YA CALCULADO (agregados, no filas individuales) de los módulos de su negocio. No inventes
números que no estén en el resumen.

Escribe un reporte en español neutro de Perú, tono cercano, sin tecnicismos, organizado en estos bloques (en
ese orden, solo los que apliquen según los datos que te di):

1. Resumen financiero: ventas, costos y ganancia por mes si hay datos de varios meses, o el total si no.
2. Lo que más se vende: qué producto, categoría o cliente destaca.
3. Otros datos relevantes: si el resumen trae otros datos (edad, zona de entrega, etc.), el patrón más claro.
4. Una recomendación práctica y accionable según todo lo anterior.

Cada bloque: un título corto en mayúscula seguido de 2-4 líneas de texto. Sé conciso, no repitas el mismo
número en más de un bloque, no uses markdown ni viñetas (texto plano, bloques separados por una línea en
blanco). No agregues saludo, introducción ni cierre -- empieza directo con el primer bloque. No menciones
nombres de personas ni teléfonos aunque aparecieran en los datos.

Datos:
${resumenDatos}`;

  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`Gemini respondió ${res.status}: ${cuerpo.slice(0, 300)}`);
  }

  const data = await res.json();
  const texto: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return texto.trim();
}
