import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { tipoModulo } from "./roles.ts";
import { esStock } from "./stock.ts";
import type { Columna } from "./excel-parser.ts";

export interface ProductoCatalogo {
  producto: string;
  precio: number | null; // promedio de venta de este producto, si hay algún módulo de Ventas
  disponible: boolean; // cantidad > 0 en algún módulo de Stock
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

// Catálogo público: productos de Stock (nombre + si hay disponible) con el
// precio promedio de venta de cada uno (de cualquier módulo de Ventas), si se
// conoce. No es el motor de Ventas/Stock real -- es una foto de solo lectura
// para compartir, nunca escribe nada.
export async function productosCatalogo(supabase: SupabaseClient, empresaId: string): Promise<ProductoCatalogo[]> {
  const { data: datasets, error } = await supabase.from("datasets").select("id, columnas").eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);

  const stockPorProducto = new Map<string, number>();
  const ventasPorProducto = new Map<string, { total: number; veces: number }>();

  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    const cProducto = columnaConRol(columnas, "producto");
    if (!cProducto) continue;

    if (esStock(columnas)) {
      const { data: records } = await supabase.from("records").select(`producto:data->>${cProducto.key}, cantidad:data->>cantidad`).eq("dataset_id", d.id);
      for (const r of (records ?? []) as unknown as { producto: string | null; cantidad: string | null }[]) {
        const producto = r.producto?.trim();
        const cantidad = Number(r.cantidad);
        if (!producto || !Number.isFinite(cantidad)) continue;
        stockPorProducto.set(producto, (stockPorProducto.get(producto) ?? 0) + cantidad);
      }
      continue;
    }

    if (tipoModulo(columnas.map((c) => c.rol)) !== "ventas") continue;
    const cMonto = columnaConRol(columnas, "monto");
    if (!cMonto) continue;
    const { data: records } = await supabase.from("records").select(`producto:data->>${cProducto.key}, monto:data->>${cMonto.key}`).eq("dataset_id", d.id);
    for (const r of (records ?? []) as unknown as { producto: string | null; monto: string | null }[]) {
      const producto = r.producto?.trim();
      const monto = Number(r.monto);
      if (!producto || !Number.isFinite(monto)) continue;
      const actual = ventasPorProducto.get(producto) ?? { total: 0, veces: 0 };
      actual.total += monto;
      actual.veces += 1;
      ventasPorProducto.set(producto, actual);
    }
  }

  const productos = new Set([...stockPorProducto.keys(), ...ventasPorProducto.keys()]);
  return [...productos]
    .map((producto) => {
      const ventas = ventasPorProducto.get(producto);
      return {
        producto,
        precio: ventas ? Math.round((ventas.total / ventas.veces) * 100) / 100 : null,
        disponible: (stockPorProducto.get(producto) ?? 0) > 0,
      };
    })
    .sort((a, b) => a.producto.localeCompare(b.producto, "es"));
}
