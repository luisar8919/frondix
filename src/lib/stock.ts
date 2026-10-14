import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { tipoModulo } from "./roles.ts";
import type { Columna } from "./excel-parser.ts";

// Solo servidor. El módulo Stock que alimenta este dataset de Ventas/Compras:
// su PROPIA columna de Producto está enlazada (enlace) al dataset de Stock
// (aparte del enlace al revés que ya tenía Stock -> Ventas, para el
// autocompletado de su propio formulario -- son dos columnas distintas, no
// se pisan). Así Ventas Y Compras pueden compartir el mismo Stock cada una
// con su propio enlace, en vez de que Stock solo pueda "mirar" hacia un lado.
export async function datasetStockDe(
  supabase: SupabaseClient,
  empresaId: string,
  columnas: Columna[]
): Promise<{ id: string; claveProducto: string } | null> {
  const cProducto = columnas.find((c) => c.rol === "producto" && c.enlace && claveValida(c.enlace.columnaKey));
  if (!cProducto?.enlace) return null;

  const { data: stockDataset } = await supabase
    .from("datasets")
    .select("id, columnas")
    .eq("id", cProducto.enlace.datasetId)
    .eq("empresa_id", empresaId)
    .single();
  if (!stockDataset) return null;
  if (!(stockDataset.columnas as Columna[]).some((c) => c.key === "cantidad")) return null; // no "parece" un stock

  return { id: stockDataset.id, claveProducto: cProducto.enlace.columnaKey };
}

// Suma (o resta) `delta` a la cantidad de un producto en el dataset de Stock.
// Si el producto todavía no tiene fila ahí, la crea empezando en 0 antes de
// ajustar -- así un producto nuevo que se compra o vende por primera vez
// también queda reflejado, sin que el usuario tenga que crearlo a mano.
export async function ajustarStock(
  supabase: SupabaseClient,
  stockDatasetId: string,
  claveProducto: string,
  producto: string,
  delta: number
): Promise<void> {
  if (!claveValida(claveProducto) || !producto || delta === 0) return;

  const { data: fila } = await supabase
    .from("records")
    .select("id, data")
    .eq("dataset_id", stockDatasetId)
    .eq(`data->>${claveProducto}`, producto)
    .maybeSingle();

  if (fila) {
    const actual = Number((fila.data as Record<string, unknown>).cantidad) || 0;
    await supabase.from("records").update({ data: { ...(fila.data as object), cantidad: actual + delta } }).eq("id", fila.id);
  } else {
    await supabase.from("records").insert({ dataset_id: stockDatasetId, data: { [claveProducto]: producto, cantidad: delta } });
  }
}

// Si `columnas` (de un dataset recién escrito) clasifica como ventas o
// compras y tiene columna de Producto, busca su Stock enlazado y lo ajusta:
// +cantidad si es compra, -cantidad si es venta (1 por defecto si el
// registro no trae columna de cantidad). No hace nada si no hay Stock
// enlazado -- no todos los módulos de Ventas/Compras tienen uno.
// `signo`: -1 para deshacer el efecto de este registro en vez de aplicarlo
// (editar/eliminar, ver revertirStockDesdeRegistro) -- misma cuenta, signo
// invertido, para no duplicar la lógica de qué cantidad corresponde.
export async function ajustarStockDesdeRegistro(
  supabase: SupabaseClient,
  empresaId: string,
  columnas: Columna[],
  datos: Record<string, unknown>,
  signo: 1 | -1 = 1
): Promise<void> {
  const tipo = tipoModulo(columnas.map((c) => c.rol));
  if (tipo !== "compras" && tipo !== "ventas") return;

  const cProducto = columnas.find((c) => c.rol === "producto");
  if (!cProducto) return;
  const producto = datos[cProducto.key]?.toString().trim();
  if (!producto) return;

  const stock = await datasetStockDe(supabase, empresaId, columnas);
  if (!stock) return;

  const cCantidad = columnas.find((c) => c.rol === "cantidad");
  const cantidadCruda = cCantidad ? Number(datos[cCantidad.key]) : NaN;
  const cantidad = Number.isFinite(cantidadCruda) && cantidadCruda > 0 ? cantidadCruda : 1;

  await ajustarStock(supabase, stock.id, stock.claveProducto, producto, signo * (tipo === "compras" ? cantidad : -cantidad));
}

// Al editar un registro: deshace el efecto que tenía en Stock con los datos
// VIEJOS, y aplica el efecto de los datos NUEVOS -- así un cambio de
// producto o de cantidad (o pasar de compra a venta, si el módulo tiene
// Tipo de movimiento) ajusta el stock correctamente en vez de sumar/restar
// dos veces. Al eliminar un registro: solo deshace (sin aplicar nada nuevo).
// Igual que ajustarStockDesdeRegistro, es "mejor esfuerzo": si falla, no
// debe tumbar la edición/eliminación, que ya es lo importante.
export async function revertirStockDesdeRegistro(
  supabase: SupabaseClient,
  empresaId: string,
  columnas: Columna[],
  datosViejos: Record<string, unknown>,
  datosNuevos?: Record<string, unknown>
): Promise<void> {
  await ajustarStockDesdeRegistro(supabase, empresaId, columnas, datosViejos, -1);
  if (datosNuevos) await ajustarStockDesdeRegistro(supabase, empresaId, columnas, datosNuevos, 1);
}
