import type { SupabaseClient } from "@supabase/supabase-js";
import type { Columna } from "./excel-parser.ts";
import { ajustarStockDesdeRegistro, revertirStockDesdeRegistro } from "./stock.ts";

// "Reglas" = condición -> acción por módulo (modelo mental: Gambit System de
// FFXII -- elegís el "detonante" (cualquier campo ya mapeado del módulo, no
// solo Estado) y el umbral que lo activa -- pero evaluando TODAS las reglas
// activas que matcheen, en orden, no solo la primera: varios efectos de un
// mismo evento (ej. "Cancelado" -> excluir de reportes Y "siempre" -> ajustar
// stock) deben poder dispararse juntos, no competir entre sí. Vocabulario
// cerrado a propósito: nunca texto libre/código, solo lo que el usuario arma
// desde dropdowns en ReglasModulo.
//
// "campo" es el tipo normal (cualquier columna del módulo, con el operador
// que corresponda a su tipo -- igual/distinto para texto, también
// mayor/menor para número). "estado" queda como alias legado SOLO para leer
// reglas guardadas antes de esta generalización (equivale a "campo" con
// operador "es") -- nunca se vuelve a escribir desde la UI.
export type Operador = "es" | "no_es" | "mayor" | "mayor_igual" | "menor" | "menor_igual";

export const OPERADORES_TEXTO: { valor: Operador; etiqueta: string }[] = [
  { valor: "es", etiqueta: "es igual a" },
  { valor: "no_es", etiqueta: "es distinto de" },
];
export const OPERADORES_NUMERO: { valor: Operador; etiqueta: string }[] = [
  { valor: "es", etiqueta: "es igual a" },
  { valor: "no_es", etiqueta: "es distinto de" },
  { valor: "mayor", etiqueta: "es mayor que" },
  { valor: "mayor_igual", etiqueta: "es mayor o igual que" },
  { valor: "menor", etiqueta: "es menor que" },
  { valor: "menor_igual", etiqueta: "es menor o igual que" },
];

export type Condicion =
  | { tipo: "siempre" }
  | { tipo: "campo"; columnaKey: string; operador: Operador; valor: string }
  | { tipo: "estado"; columnaKey: string; valor: string }; // legado, ver comentario arriba

export type Accion =
  | { tipo: "excluir_de_reportes" }
  | { tipo: "cambiar_estado"; columnaKey: string; valor: string }
  | { tipo: "ajustar_stock" }; // reusa stock.ts tal cual -- ver comentario en aplicarReglasDesdeRegistro

export interface Regla {
  id: string;
  activa: boolean;
  // "automatica" = la creó el sistema (enlace de stock, sugerencia de plantilla) -- informativo
  // para la UI (ver ReglasModulo), no cambia en nada cómo se evalúa.
  origen: "automatica" | "manual";
  condicion: Condicion;
  accion: Accion;
}

function condicionCumple(condicion: Condicion, datos: Record<string, unknown>): boolean {
  if (condicion.tipo === "siempre") return true;
  if (condicion.tipo === "estado") return String(datos[condicion.columnaKey] ?? "").trim() === condicion.valor;

  const crudo = datos[condicion.columnaKey];
  if (condicion.operador === "es") return String(crudo ?? "").trim() === condicion.valor;
  if (condicion.operador === "no_es") return String(crudo ?? "").trim() !== condicion.valor;

  // Resto de operadores son numéricos (mayor/menor): si cualquiera de los 2
  // lados no es un número real, la condición simplemente no matchea -- nunca
  // un error, un campo de texto con un operador numérico solo no dispara.
  const num = Number(crudo);
  const umbral = Number(condicion.valor);
  if (!Number.isFinite(num) || !Number.isFinite(umbral)) return false;
  if (condicion.operador === "mayor") return num > umbral;
  if (condicion.operador === "mayor_igual") return num >= umbral;
  if (condicion.operador === "menor") return num < umbral;
  return num <= umbral; // menor_igual
}

// Único punto de entrada que llaman las rutas de /api/records al crear, editar
// o borrar un registro -- reemplaza las llamadas directas a
// ajustarStockDesdeRegistro/revertirStockDesdeRegistro que antes vivían ahí.
// El ajuste de Stock NO se reimplementa acá como una acción genérica
// interpretada: esta función solo DESPACHA a las funciones ya existentes y
// probadas de stock.ts (esa matemática -- qué dataset de Stock, qué columna
// de cantidad, el Kardex -- sigue siendo de ahí, sin tocar). Lo único
// realmente nuevo/genérico son "excluir_de_reportes" y "cambiar_estado".
//
// `datosNuevos`/`datosViejos` siguen el mismo significado que ya tenían en
// stock.ts: solo `datosNuevos` = alta; ambos = edición; solo `datosViejos` =
// eliminación. Las reglas basadas en condición (no "siempre") solo tienen
// sentido si hay una fila viva después del cambio, así que se saltean en una
// eliminación -- no hay nada que excluir de reportes de un registro que ya
// no existe.
//
// "Mejor esfuerzo" como el resto de este archivo hermano (stock.ts): quien
// llama debe envolver esto en try/catch, un fallo acá nunca debe tumbar el
// guardado del registro, que ya es lo importante y ya quedó bien guardado.
export async function aplicarReglasDesdeRegistro(
  supabase: SupabaseClient,
  empresaId: string,
  recordId: string | null,
  columnas: Columna[],
  reglas: Regla[],
  datosNuevos: Record<string, unknown> | undefined,
  datosViejos: Record<string, unknown> | undefined,
  userId: string | null = null
): Promise<void> {
  let datosFinal: Record<string, unknown> | undefined;
  let huboMutacion = false;

  for (const regla of reglas) {
    if (!regla.activa) continue;

    if (regla.accion.tipo === "ajustar_stock") {
      if (datosNuevos && !datosViejos) {
        await ajustarStockDesdeRegistro(supabase, empresaId, columnas, datosNuevos, 1, userId);
      } else if (datosViejos) {
        await revertirStockDesdeRegistro(supabase, empresaId, columnas, datosViejos, datosNuevos, userId);
      }
      continue;
    }

    // excluir_de_reportes / cambiar_estado: necesitan una fila viva con la que
    // evaluar la condición y a la que aplicarle el efecto -- no aplica a un
    // registro que se acaba de eliminar (datosNuevos viene undefined ahí).
    if (!datosNuevos) continue;
    if (!condicionCumple(regla.condicion, datosNuevos)) continue;

    if (!datosFinal) datosFinal = { ...datosNuevos };
    if (regla.accion.tipo === "excluir_de_reportes") {
      datosFinal._excluido_reportes = true;
      huboMutacion = true;
    } else if (regla.accion.tipo === "cambiar_estado") {
      datosFinal[regla.accion.columnaKey] = regla.accion.valor;
      huboMutacion = true;
    }
  }

  if (huboMutacion && recordId && datosFinal) {
    await supabase.from("records").update({ data: datosFinal }).eq("id", recordId);
  }
}
