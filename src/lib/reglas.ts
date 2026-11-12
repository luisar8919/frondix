import type { SupabaseClient } from "@supabase/supabase-js";
import type { Columna } from "./excel-parser.ts";
import { ajustarStockDesdeRegistro, revertirStockDesdeRegistro } from "./stock.ts";

// "Reglas" = condición -> acción por módulo (modelo mental: Gambit System de
// FFXII, pero evaluando TODAS las reglas activas que matcheen, en orden -- no
// solo la primera -- porque varios efectos de un mismo evento (ej. "Cancelado"
// -> excluir de reportes Y "siempre" -> ajustar stock) deben poder dispararse
// juntos, no competir entre sí. Vocabulario cerrado a propósito: nunca texto
// libre/código, solo lo que el usuario arma desde dropdowns en EditarTabla.
export type Condicion = { tipo: "siempre" } | { tipo: "estado"; columnaKey: string; valor: string };

export type Accion =
  | { tipo: "excluir_de_reportes" }
  | { tipo: "cambiar_estado"; columnaKey: string; valor: string }
  | { tipo: "ajustar_stock" }; // reusa stock.ts tal cual -- ver comentario en aplicarReglasDesdeRegistro

export interface Regla {
  id: string;
  activa: boolean;
  // "automatica" = la creó el sistema (enlace de stock, sugerencia de plantilla) -- informativo
  // para la UI (ver EditarTabla), no cambia en nada cómo se evalúa.
  origen: "automatica" | "manual";
  condicion: Condicion;
  accion: Accion;
}

function condicionCumple(condicion: Condicion, datos: Record<string, unknown>): boolean {
  if (condicion.tipo === "siempre") return true;
  return String(datos[condicion.columnaKey] ?? "").trim() === condicion.valor;
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
