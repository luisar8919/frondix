import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import type { Columna } from "./excel-parser.ts";
import { tipoModulo } from "./roles.ts";
import { preciosDeCompra, combinarPrecios, type PrecioCompra } from "./divisor.ts";

export interface ValorizacionModulo {
  datasetId: string;
  datasetNombre: string;
  valorTotal: number;
  productosSinCosto: number; // cuántos productos distintos no tienen un precio de compra conocido
}

export interface ValorizacionInventario {
  modulos: ValorizacionModulo[];
  total: number;
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

// Cuánto dinero hay "parado" en mercadería almacenada: cantidad (de cada módulo
// de Stock) × el precio de compra más reciente de ese producto (de cualquier
// módulo de Compras de la empresa) -- mismo criterio que ya usa el import de
// Excel para completar costos (ver divisor.ts), reutilizado acá en vez de
// reinventar otra forma de calcular "el precio de un producto".
export async function valorizacionInventario(supabase: SupabaseClient, empresaId: string): Promise<ValorizacionInventario> {
  const { data: datasets, error } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);
  const todos = datasets ?? [];

  const mapas: Map<string, PrecioCompra>[] = [];
  for (const d of todos) {
    const columnas = d.columnas as Columna[];
    if (tipoModulo(columnas.map((c) => c.rol)) !== "compras") continue;
    const cProducto = columnaConRol(columnas, "producto");
    const cMonto = columnaConRol(columnas, "monto");
    if (!cProducto || !cMonto) continue;
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));

    const seleccion = `producto:data->>${cProducto.key}, monto:data->>${cMonto.key}` + (cFecha ? `, fecha:data->>${cFecha.key}` : "");
    const { data: records, error: errorRecords } = await supabase.from("records").select(seleccion).eq("dataset_id", d.id);
    if (errorRecords) throw new Error(errorRecords.message);
    mapas.push(preciosDeCompra((records ?? []) as unknown as Record<string, unknown>[], "producto", "monto", cFecha ? "fecha" : undefined));
  }
  const precios = combinarPrecios(mapas);

  const modulos: ValorizacionModulo[] = [];
  for (const d of todos) {
    const columnas = d.columnas as Columna[];
    const cCantidad = columnas.find((c) => c.key === "cantidad" && claveValida(c.key));
    const cProducto = columnaConRol(columnas, "producto");
    if (!cCantidad || !cProducto) continue; // no "parece" un módulo de Stock

    const { data: records, error: errorRecords } = await supabase
      .from("records")
      .select(`producto:data->>${cProducto.key}, cantidad:data->>${cCantidad.key}`)
      .eq("dataset_id", d.id);
    if (errorRecords) throw new Error(errorRecords.message);

    let valorTotal = 0;
    let productosSinCosto = 0;
    for (const r of (records ?? []) as unknown as { producto: string | null; cantidad: string | null }[]) {
      const cantidad = Number(r.cantidad);
      if (!r.producto || !Number.isFinite(cantidad)) continue;
      const precio = precios.get(r.producto)?.precio;
      if (precio === undefined) { productosSinCosto++; continue; }
      valorTotal += cantidad * precio;
    }
    if (valorTotal > 0 || productosSinCosto > 0) {
      modulos.push({ datasetId: d.id, datasetNombre: d.nombre, valorTotal: Math.round(valorTotal * 100) / 100, productosSinCosto });
    }
  }

  const total = Math.round(modulos.reduce((s, m) => s + m.valorTotal, 0) * 100) / 100;
  return { modulos, total };
}
