import { ROLES } from "./roles.ts";

// Solo se llama cuando la estructura sale "confusa" de las reglas normales (ver
// estructuraConfusa en roles.ts): no en cada importación, para no gastar de más.
// Nunca cambia el tipo de dato (texto/numero/fecha) ya detectado por el parser,
// solo propone un nombre más claro y a qué se refiere cada columna.
// Mismo patrón que gemini.ts (fetch directo, sin SDK) -- responseMimeType
// "application/json" le pide a Gemini que devuelva JSON válido directo, sin
// tener que parsear texto libre como en los highlights.
const MODELO = "gemini-3.5-flash-lite";
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

const ROLES_VALIDOS = ROLES.map((r) => r.valor);

export interface ColumnaParaSugerir {
  key: string;
  labelActual: string;
}

// `filas` es una muestra chica (hasta ~10) de las filas ya parseadas: {key: valor}.
export async function sugerirEstructuraConIA(
  columnas: ColumnaParaSugerir[],
  filas: Record<string, unknown>[]
): Promise<{ key: string; label: string; rol: string | null }[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY para usar la sugerencia por IA.");

  const muestra = filas.slice(0, 10).map((f) => Object.fromEntries(columnas.map((c) => [c.key, f[c.key] ?? null])));

  const prompt = `Ayudas a un pequeño negocio peruano (mecánico, tienda, revendedor) a entender un Excel desordenado
que subió a Frondix. Te doy las columnas (en el mismo orden) y una muestra de filas. Para cada columna, EN EL
MISMO ORDEN, propone un nombre corto y claro en español, y a qué rol de negocio corresponde. No inventes datos
que no estén en la muestra.

Roles válidos: ${ROLES_VALIDOS.join(", ")}, o "ninguno" si no aplica ninguno.

Columnas (clave interna: nombre actual):
${columnas.map((c) => `- ${c.key}: "${c.labelActual}"`).join("\n")}

Muestra de filas:
${JSON.stringify(muestra, null, 1)}

Responde ÚNICAMENTE con JSON válido, sin texto antes ni después, con esta forma exacta (un elemento por
columna, en el mismo orden que te las di):
{"columnas":[{"label":"...","rol":"..."}]}`;

  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`Gemini respondió ${res.status}: ${cuerpo.slice(0, 300)}`);
  }

  const data = await res.json();
  const texto: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  let sugeridas: { label?: string; rol?: string }[] = [];
  try {
    sugeridas = JSON.parse(texto).columnas ?? [];
  } catch {
    // Respuesta no vino en JSON (poco común con responseMimeType, pero no imposible):
    // se degrada a "sin sugerencia" en vez de reventar la petición.
  }

  return columnas.map((c, i) => {
    const rol = sugeridas[i]?.rol;
    return {
      key: c.key,
      label: sugeridas[i]?.label || c.labelActual,
      rol: rol && rol !== "ninguno" && (ROLES_VALIDOS as string[]).includes(rol) ? rol : null,
    };
  });
}
