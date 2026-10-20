import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import type { Columna } from "./excel-parser.ts";
import { tipoModulo } from "./roles.ts";

export interface CuentaPorPagar {
  datasetId: string;
  datasetNombre: string;
  proveedor: string | null;
  fecha: string | null;
  saldo: number;
}

export interface ModuloSinSaldoPendiente { datasetId: string; datasetNombre: string }

export interface ResultadoCuentasPorPagar {
  cuentas: CuentaPorPagar[];
  modulosSinConfigurar: ModuloSinSaldoPendiente[];
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

// Espejo de cuentasPorCobrar.ts pero del lado de Compras: lo que TÚ le debés a
// tus proveedores. Mismo criterio -- columna "Saldo pendiente" (rol
// saldo_pendiente) con valor mayor a 0 en un módulo de Compras.
export async function cuentasPorPagar(supabase: SupabaseClient, empresaId: string): Promise<ResultadoCuentasPorPagar> {
  const { data: datasets, error } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);

  const cuentas: CuentaPorPagar[] = [];
  const modulosSinConfigurar: ModuloSinSaldoPendiente[] = [];
  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    if (tipoModulo(columnas.map((c) => c.rol)) !== "compras") continue; // cuentas por pagar es cosa de Compras

    const cSaldo = columnaConRol(columnas, "saldo_pendiente");
    if (!cSaldo) {
      modulosSinConfigurar.push({ datasetId: d.id, datasetNombre: d.nombre });
      continue;
    }
    const cProveedor = columnaConRol(columnas, "proveedor");
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));

    const seleccion = [`saldo:data->>${cSaldo.key}`, cProveedor && `proveedor:data->>${cProveedor.key}`, cFecha && `fecha:data->>${cFecha.key}`]
      .filter(Boolean).join(", ");
    const { data: records, error: errorRecords } = await supabase.from("records").select(seleccion).eq("dataset_id", d.id);
    if (errorRecords) throw new Error(errorRecords.message);

    for (const r of (records ?? []) as unknown as { saldo: string | null; proveedor?: string | null; fecha?: string | null }[]) {
      const saldo = Number(r.saldo);
      if (!Number.isFinite(saldo) || saldo <= 0) continue;
      cuentas.push({ datasetId: d.id, datasetNombre: d.nombre, proveedor: r.proveedor ?? null, fecha: r.fecha ?? null, saldo });
    }
  }
  return { cuentas: cuentas.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")), modulosSinConfigurar };
}
