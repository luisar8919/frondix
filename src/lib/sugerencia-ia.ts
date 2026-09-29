import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ROLES } from "./roles.ts";

// Solo se llama cuando la estructura sale "confusa" de las reglas normales (ver
// estructuraConfusa en roles.ts): no en cada importación, para no gastar de más.
// Nunca cambia el tipo de dato (texto/numero/fecha) ya detectado por el parser,
// solo propone un nombre más claro y a qué se refiere cada columna.

const RolesValidos = ROLES.map((r) => r.valor) as [string, ...string[]];

const SugerenciaColumna = z.object({
  label: z.string().describe("Nombre claro y corto para la columna, en español, sin inventar datos"),
  rol: z.enum(["ninguno", ...RolesValidos]).describe("Qué representa la columna para el negocio, o 'ninguno' si no aplica"),
});

const SugerenciaEstructura = z.object({
  columnas: z.array(SugerenciaColumna),
});

export interface ColumnaParaSugerir {
  key: string;
  labelActual: string;
}

// `filas` es una muestra chica (hasta ~10) de las filas ya parseadas: {key: valor}.
export async function sugerirEstructuraConIA(
  columnas: ColumnaParaSugerir[],
  filas: Record<string, unknown>[]
): Promise<{ key: string; label: string; rol: string | null }[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta configurar ANTHROPIC_API_KEY para usar la sugerencia por IA.");
  }
  const client = new Anthropic();

  const muestra = filas.slice(0, 10).map((f) => Object.fromEntries(columnas.map((c) => [c.key, f[c.key] ?? null])));

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4000,
    system:
      "Ayudas a un pequeño negocio peruano (mecánico, tienda, revendedor) a entender un Excel desordenado que subió a Frondix. " +
      "Te doy las columnas (en el mismo orden) y una muestra de filas. Para cada columna, en el mismo orden, propone un nombre " +
      "corto y claro en español, y a qué rol de negocio corresponde (o 'ninguno'). No inventes datos que no estén en la muestra.",
    messages: [
      {
        role: "user",
        content: `Columnas (clave interna: nombre actual):\n${columnas.map((c) => `- ${c.key}: "${c.labelActual}"`).join("\n")}\n\nMuestra de filas:\n${JSON.stringify(muestra, null, 1)}`,
      },
    ],
    output_config: { format: zodOutputFormat(SugerenciaEstructura) },
  });

  const sugeridas = response.parsed_output?.columnas ?? [];
  return columnas.map((c, i) => ({
    key: c.key,
    label: sugeridas[i]?.label || c.labelActual,
    rol: sugeridas[i] && sugeridas[i].rol !== "ninguno" ? sugeridas[i].rol : null,
  }));
}
