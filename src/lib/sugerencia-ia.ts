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

// Cuando una hoja tiene columna de Tipo de movimiento pero algunas filas traen
// un valor que ni esVenta ni esCompra reconocen (ver dividirVentasYCompras en
// divisor.ts), en vez de solo avisar que se dejaron fuera, se le muestran a
// Gemini hasta 5 filas YA clasificadas de cada lado (de esta misma hoja, el
// mejor contexto posible) como ejemplo, y hasta 10 filas ambiguas para que
// proponga dónde caen. Es una SUGERENCIA: el llamador decide si las agrega o
// las deja fuera -- nunca se inventan ventas/compras sin que algo las revise.
export async function clasificarVentaCompraConIA(
  claveTipo: string,
  ejemplosVenta: Record<string, unknown>[],
  ejemplosCompra: Record<string, unknown>[],
  filasAmbiguas: Record<string, unknown>[]
): Promise<("venta" | "compra" | null)[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY para usar la sugerencia por IA.");

  const muestra = (filas: Record<string, unknown>[]) => filas.slice(0, 5);
  const ambiguas = filasAmbiguas.slice(0, 10);

  const prompt = `Ayudas a un pequeño negocio a cargar un Excel a Frondix. Esta hoja tiene una columna "${claveTipo}"
que debería decir si cada fila es una Venta o una Compra, pero algunas filas traen un valor que no se reconoce
(vacío, raro, o un texto distinto a los patrones usuales). Te doy ejemplos YA clasificados de esta misma hoja
(para que notes el patrón: puede ser el valor exacto de "${claveTipo}", o el sentido de las demás columnas, como
si el proveedor/cliente o el monto son típicos de compra o de venta) y las filas ambiguas, EN EL MISMO ORDEN.
Para cada fila ambigua responde "venta", "compra", o "ninguno" si de verdad no se puede saber. No inventes,
usa solo lo que ves en los ejemplos.

Ejemplos de Venta:
${JSON.stringify(muestra(ejemplosVenta), null, 1)}

Ejemplos de Compra:
${JSON.stringify(muestra(ejemplosCompra), null, 1)}

Filas ambiguas a clasificar (en este orden):
${JSON.stringify(ambiguas, null, 1)}

Responde ÚNICAMENTE con JSON válido, sin texto antes ni después, un elemento por fila ambigua en el mismo orden:
{"filas":[{"tipo":"venta"}]}`;

  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`Gemini respondió ${res.status}: ${cuerpo.slice(0, 300)}`);
  }

  const data = await res.json();
  const texto: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  let resultado: { tipo?: string }[] = [];
  try {
    resultado = JSON.parse(texto).filas ?? [];
  } catch {
    // degrada a "sin clasificar nada" en vez de reventar la importación
  }

  return ambiguas.map((_, i) => {
    const tipo = resultado[i]?.tipo;
    return tipo === "venta" || tipo === "compra" ? tipo : null;
  });
}
