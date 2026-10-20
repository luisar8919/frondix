import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import type { Columna } from "./excel-parser.ts";
import { esStock } from "./stock.ts";

export interface AlertaStock {
  datasetId: string;
  datasetNombre: string;
  producto: string;
  cantidad: number;
  minimo: number;
}

export interface ModuloSinConfigurar {
  datasetId: string;
  datasetNombre: string;
}

export interface ResultadoAlertasStock {
  alertas: AlertaStock[];
  // Módulos que "parecen" Stock (tienen cantidad y producto) pero nadie marcó
  // todavía qué cantidad es el mínimo -- para enseñarle al dueño que la función
  // existe y cómo activarla, en vez de quedar invisible hasta que la descubra solo.
  modulosSinConfigurar: ModuloSinConfigurar[];
}

// Un módulo "parece Stock" si tiene una columna cantidad (mismo criterio que
// datasetStockDe en stock.ts). La alerta es TOTALMENTE configurable: solo
// aplica si además alguien marcó una columna como "Stock mínimo" (rol
// stock_minimo) con un valor mayor a 0 en esa fila -- nadie define un mínimo
// global que no tenga sentido para todos los productos, cada fila trae el suyo
// (o ninguno, y simplemente no genera alerta).
export async function alertasStock(supabase: SupabaseClient, empresaId: string): Promise<ResultadoAlertasStock> {
  const { data: datasets, error } = await supabase
    .from("datasets")
    .select("id, nombre, columnas")
    .eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);

  const alertas: AlertaStock[] = [];
  const modulosSinConfigurar: ModuloSinConfigurar[] = [];
  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    if (!esStock(columnas)) continue;
    const cCantidad = columnas.find((c) => c.key === "cantidad" && claveValida(c.key))!;
    const cProducto = columnas.find((c) => c.rol === "producto" && claveValida(c.key))!;

    const cMinimo = columnas.find((c) => c.rol === "stock_minimo" && claveValida(c.key));
    if (!cMinimo) {
      modulosSinConfigurar.push({ datasetId: d.id, datasetNombre: d.nombre });
      continue;
    }

    const { data: records, error: errorRecords } = await supabase
      .from("records")
      .select(`producto:data->>${cProducto.key}, cantidad:data->>${cCantidad.key}, minimo:data->>${cMinimo.key}`)
      .eq("dataset_id", d.id);
    if (errorRecords) throw new Error(errorRecords.message);

    for (const r of (records ?? []) as unknown as { producto: string | null; cantidad: string | null; minimo: string | null }[]) {
      const cantidad = Number(r.cantidad);
      const minimo = Number(r.minimo);
      if (!r.producto || !Number.isFinite(cantidad) || !Number.isFinite(minimo) || minimo <= 0) continue;
      if (cantidad <= minimo) {
        alertas.push({ datasetId: d.id, datasetNombre: d.nombre, producto: r.producto, cantidad, minimo });
      }
    }
  }
  return { alertas: alertas.sort((a, b) => a.cantidad - b.cantidad), modulosSinConfigurar };
}
