// Integración con la API de Gemini (Google) para los highlights del panel.
// Llamada REST directa (sin el SDK @google/genai) -- mismo criterio que culqi.ts
// y el envío de WhatsApp: una dependencia menos para algo tan simple como un POST.
// Referencia: https://ai.google.dev/api/generate-content
const MODELO = "gemini-3.5-flash-lite";
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

export interface BloqueHighlight {
  titulo: string;
  texto: string;
}

// Separador de bloques en la respuesta cruda de Gemini -- se pide así (texto plano,
// un separador de una línea) en vez de JSON para no gastar tokens de salida en llaves
// y comillas repetidas; el servidor lo parte en bloques para pintarlos como tarjetas.
const SEPARADOR = "===";

// Lo que entra en resumenDatos ya salió filtrado de datosReportes.ts: solo agregados
// (ventas, costos, rankings, % de columnas libres como edad o zona) -- nunca una fila
// ni un nombre de cliente/teléfono (ver resumenConLibresParaIA). Como ya no se manda
// texto crudo, el prompt le puede pedir un reporte más largo sin disparar el consumo
// de tokens de entrada; el límite de salida (maxOutputTokens) es lo único que lo acota.
export async function generarHighlights(resumenDatos: string): Promise<BloqueHighlight[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY");

  const prompt = `Eres un asistente que ayuda a dueños de pequeños negocios peruanos a entender sus datos de ventas.
Te doy un resumen YA CALCULADO (agregados, no filas individuales) de los módulos de su negocio. No inventes
números que no estén en el resumen.

Arma un reporte con estos bloques, en este orden, solo los que apliquen según los datos que te di:
1. Resumen financiero (ventas, costos y ganancia por mes si hay varios meses, o el total si no)
2. Lo que mas se vende (que producto, categoria o cliente destaca)
3. Otros datos relevantes (solo si el resumen trae otros datos, como edad o zona de entrega)
4. Recomendacion (una sugerencia practica y accionable según todo lo anterior)

Formato de salida exacto, en español neutro de Perú, tono cercano, sin tecnicismos:
- La primera línea de cada bloque es el título (tal cual arriba, sin numerar).
- La siguiente línea es el contenido: 2-4 líneas corridas en un solo párrafo, texto plano, sin
  markdown, sin viñetas ni guiones de lista, sin asteriscos.
- Los bloques van separados por una línea que diga exactamente "${SEPARADOR}" (nada más en esa línea).
No agregues saludo, introducción ni cierre -- empieza directo con el primer bloque. No menciones nombres
de personas ni teléfonos aunque aparecieran en los datos.

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
  return texto
    .split(SEPARADOR)
    .map((bloque): BloqueHighlight => {
      const lineas = bloque.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      const titulo = lineas.shift() ?? "";
      return { titulo, texto: lineas.join(" ") };
    })
    .filter((b) => b.titulo && b.texto);
}
