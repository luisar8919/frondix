import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import type { Columna } from "./excel-parser.ts";
import { tipoModulo } from "./roles.ts";

export interface CuentaPorCobrar {
  datasetId: string;
  datasetNombre: string;
  recordId: string;
  cliente: string | null;
  fecha: string | null;
  saldo: number;
}

export interface ModuloSinSaldoPendiente { datasetId: string; datasetNombre: string }

export interface ResultadoCuentasPorCobrar {
  cuentas: CuentaPorCobrar[];
  // Módulos de Ventas que no tienen columna "Saldo pendiente" -- para enseñar
  // la función una vez (no todos los negocios venden al fiado, por eso es un
  // tip que se cierra, no una alerta persistente como el stock mínimo).
  modulosSinConfigurar: ModuloSinSaldoPendiente[];
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

// Ventas a crédito: cualquier módulo que tenga una columna "Saldo pendiente"
// (rol saldo_pendiente, totalmente configurable -- el dueño decide qué módulo
// la usa) con un valor mayor a 0 en una fila es una cuenta por cobrar. Sin esa
// columna marcada, el módulo simplemente no participa.
export async function cuentasPorCobrar(supabase: SupabaseClient, empresaId: string): Promise<ResultadoCuentasPorCobrar> {
  const { data: datasets, error } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);

  const cuentas: CuentaPorCobrar[] = [];
  const modulosSinConfigurar: ModuloSinSaldoPendiente[] = [];
  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    if (tipoModulo(columnas.map((c) => c.rol), d.nombre) !== "ventas") continue; // cuentas por cobrar es cosa de Ventas

    const cSaldo = columnaConRol(columnas, "saldo_pendiente");
    if (!cSaldo) {
      modulosSinConfigurar.push({ datasetId: d.id, datasetNombre: d.nombre });
      continue;
    }
    const cCliente = columnaConRol(columnas, "cliente");
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));

    const seleccion = ["id", `saldo:data->>${cSaldo.key}`, cCliente && `cliente:data->>${cCliente.key}`, cFecha && `fecha:data->>${cFecha.key}`]
      .filter(Boolean).join(", ");
    const { data: records, error: errorRecords } = await supabase.from("records").select(seleccion).eq("dataset_id", d.id);
    if (errorRecords) throw new Error(errorRecords.message);

    for (const r of (records ?? []) as unknown as { id: string; saldo: string | null; cliente?: string | null; fecha?: string | null }[]) {
      const saldo = Number(r.saldo);
      if (!Number.isFinite(saldo) || saldo <= 0) continue;
      cuentas.push({ datasetId: d.id, datasetNombre: d.nombre, recordId: r.id, cliente: r.cliente ?? null, fecha: r.fecha ?? null, saldo });
    }
  }
  return { cuentas: cuentas.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")), modulosSinConfigurar };
}
