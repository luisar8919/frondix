import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import type { Columna } from "./excel-parser.ts";
import { normalizarTexto } from "./seguimiento.ts";

export interface MovimientoCliente {
  datasetNombre: string;
  fecha: string | null;
  producto: string | null;
  monto: number | null;
}

export interface HistorialCliente {
  nombre: string;
  movimientos: MovimientoCliente[];
  totalGastado: number;
  cantidadCompras: number;
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));
const PAGINA = 1000;
const TOPE_FILAS = 5000; // por módulo: alcanza de sobra para el historial de un solo cliente

// Todo lo que compró un cliente, juntando CUALQUIER módulo que tenga columna de
// Cliente (no solo uno) -- el mismo cliente puede aparecer en varias tablas si el
// negocio subió Excels separados por categoría o por mes.
export async function historialCliente(supabase: SupabaseClient, empresaId: string, nombre: string): Promise<HistorialCliente> {
  const clave = normalizarTexto(nombre);
  const { data: datasets, error } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);

  const movimientos: MovimientoCliente[] = [];
  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    const cCliente = columnaConRol(columnas, "cliente");
    if (!cCliente) continue;
    const cProducto = columnaConRol(columnas, "producto");
    const cMonto = columnaConRol(columnas, "monto");
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));

    const seleccion = [
      `cliente:data->>${cCliente.key}`,
      cProducto && `producto:data->>${cProducto.key}`,
      cMonto && `monto:data->>${cMonto.key}`,
      cFecha && `fecha:data->>${cFecha.key}`,
    ].filter(Boolean).join(", ");

    for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
      const { data: records, error: errorRecords } = await supabase
        .from("records")
        .select(seleccion)
        .eq("dataset_id", d.id)
        .range(desde, desde + PAGINA - 1);
      if (errorRecords) throw new Error(errorRecords.message);
      const filas = (records ?? []) as unknown as { cliente: string | null; producto?: string | null; monto?: string | null; fecha?: string | null }[];
      for (const f of filas) {
        if (!f.cliente || normalizarTexto(f.cliente) !== clave) continue;
        const monto = f.monto !== undefined && f.monto !== null ? Number(f.monto) : null;
        movimientos.push({
          datasetNombre: d.nombre,
          fecha: f.fecha ?? null,
          producto: f.producto ?? null,
          monto: monto !== null && Number.isFinite(monto) ? monto : null,
        });
      }
      if (filas.length < PAGINA) break;
    }
  }

  movimientos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const totalGastado = Math.round(movimientos.reduce((s, m) => s + (m.monto ?? 0), 0) * 100) / 100;

  return { nombre, movimientos, totalGastado, cantidadCompras: movimientos.length };
}
