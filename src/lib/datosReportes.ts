import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { totalesPorMes, topPor, sumaMonto, flujoCaja, progresoMetas } from "./reportes.ts";
import type { Columna } from "./excel-parser.ts";

const PAGINA = 1000; // Supabase corta cada respuesta en 1000 filas
const TOPE_FILAS = 20000; // por módulo; más que eso hoy no se analiza

// Mismo patrón que /api/seguimiento: pide solo las columnas necesarias, paginado.
async function leerFilas(supabase: SupabaseClient, datasetId: string, claves: Partial<Record<"f" | "m" | "p" | "c" | "co", string>>) {
  const seleccion = Object.entries(claves).map(([alias, clave]) => `${alias}:data->>${clave}`).join(",");
  const filas: { f?: string | null; m?: string | number | null; p?: string | null; c?: string | null; co?: string | number | null }[] = [];
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await supabase
      .from("records")
      .select(seleccion)
      .eq("dataset_id", datasetId)
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data as unknown as typeof filas));
    if (data.length < PAGINA) break;
  }
  return filas;
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

export interface ModuloReporte {
  datasetId: string;
  nombre: string;
  plantillas: string[];
  totalesPorMes: ReturnType<typeof totalesPorMes> | null;
  topProducto: ReturnType<typeof topPor> | null;
  topCliente: ReturnType<typeof topPor> | null;
  sumaTotal: number | null;
  flujoCaja: ReturnType<typeof flujoCaja> | null;
  metas: (ReturnType<typeof progresoMetas>[number] & { id: string })[] | null;
}

// Reportes prehechos: para cada módulo con roles marcados, arma solo lo que aplica
// (total por mes si hay Monto+Fecha; top 5 si hay Producto o Cliente). Sin configurar
// nada. Extraído de /api/reportes para que /api/highlights pueda armar el mismo
// resumen (y mandárselo a la IA) sin repetir las consultas ni la lógica.
export async function calcularModulosReporte(supabase: SupabaseClient, empresaId: string): Promise<ModuloReporte[]> {
  const { data: datasets, error: errorDatasets } = await supabase
    .from("datasets")
    .select("id, nombre, columnas, incluye_igv")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false });
  if (errorDatasets) throw new Error(errorDatasets.message);

  const ahora = new Date();
  const modulos: ModuloReporte[] = [];

  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));
    const cMonto = columnaConRol(columnas, "monto");
    const cCosto = columnaConRol(columnas, "costo");
    const cProducto = columnaConRol(columnas, "producto");
    const cCliente = columnaConRol(columnas, "cliente");

    const conTotales = !!(cFecha && cMonto);
    const conTopProducto = !!cProducto;
    const conTopCliente = !!cCliente;
    const conFlujoCaja = !!(cMonto && cCosto);
    const conSumaTotal = !!cMonto && !conTotales && !conFlujoCaja;
    if (!conTotales && !conTopProducto && !conTopCliente && !conSumaTotal && !conFlujoCaja) continue;

    const filas = await leerFilas(supabase, d.id, {
      ...(cFecha && { f: cFecha.key }),
      ...(cMonto && { m: cMonto.key }),
      ...(cCosto && { co: cCosto.key }),
      ...(cProducto && { p: cProducto.key }),
      ...(cCliente && { c: cCliente.key }),
    });

    const plantillas = [
      conFlujoCaja && "flujo_caja",
      conTotales && "ventas_mensuales",
      conTopProducto && "top_productos",
      conTopCliente && "top_clientes",
      conSumaTotal && "total_simple",
    ].filter((x): x is string => !!x);

    let metas: ModuloReporte["metas"] = null;
    if (conTopProducto) {
      const { data: metasDataset } = await supabase.from("metas").select("id, producto, cantidad_objetivo").eq("dataset_id", d.id);
      const idPorProducto = new Map((metasDataset ?? []).map((m) => [m.producto, m.id]));
      metas = progresoMetas(
        filas.map((f) => ({ clave: f.p })),
        (metasDataset ?? []).map((m) => ({ producto: m.producto, cantidadObjetivo: m.cantidad_objetivo }))
      ).map((p) => ({ ...p, id: idPorProducto.get(p.producto)! }));
    }

    modulos.push({
      datasetId: d.id,
      nombre: d.nombre,
      plantillas,
      totalesPorMes: conTotales ? totalesPorMes(filas, ahora, 6) : null,
      topProducto: conTopProducto ? topPor(filas.map((f) => ({ clave: f.p, m: f.m })), 5) : null,
      topCliente: conTopCliente ? topPor(filas.map((f) => ({ clave: f.c, m: f.m })), 5) : null,
      sumaTotal: conSumaTotal ? sumaMonto(filas) : null,
      flujoCaja: conFlujoCaja ? flujoCaja(filas.map((f) => ({ m: f.m, costo: f.co })), !!d.incluye_igv) : null,
      metas,
    });
  }

  return modulos;
}

// Texto plano con solo los números ya calculados (nunca filas/registros crudos) para
// mandarle a la IA. Determinista y acotado: nada de volcar la base, solo lo que ya
// se le muestra al usuario en Reportes.
export function resumenParaIA(modulos: ModuloReporte[]): string {
  if (modulos.length === 0) return "Todavía no hay módulos con suficientes datos para reportar.";
  return modulos
    .map((m) => {
      const lineas = [`Módulo "${m.nombre}":`];
      if (m.flujoCaja) {
        const f = m.flujoCaja;
        lineas.push(`  Ventas: S/ ${f.ventas}, Costos: S/ ${f.costos}, Ganancia neta: S/ ${f.gananciaNeta}`);
      }
      if (m.totalesPorMes) {
        const ultimos = m.totalesPorMes.map((t) => `${t.mes}: S/ ${t.total}`).join(", ");
        lineas.push(`  Ventas por mes (últimos ${m.totalesPorMes.length}): ${ultimos}`);
      }
      if (m.sumaTotal !== null) lineas.push(`  Total: S/ ${m.sumaTotal}`);
      if (m.topProducto?.length) lineas.push(`  Top productos: ${m.topProducto.map((p) => `${p.clave} (${p.total > 0 ? "S/ " + p.total : p.veces + "x"})`).join(", ")}`);
      if (m.topCliente?.length) lineas.push(`  Top clientes: ${m.topCliente.map((c) => `${c.clave} (${c.total > 0 ? "S/ " + c.total : c.veces + "x"})`).join(", ")}`);
      if (m.metas?.length) lineas.push(`  Metas: ${m.metas.map((x) => `${x.producto} ${x.vendidos}/${x.objetivo}${x.alcanzada ? " lograda" : ""}`).join(", ")}`);
      return lineas.join("\n");
    })
    .join("\n\n");
}

// Huella de los números que le importan a un highlight (sin ids ni nombres de
// módulo, que no cambian el contenido). La decide la plataforma, no la IA: si la
// huella de hoy es igual a la del último highlight guardado, no cambió nada que
// valga la pena contarle de nuevo al usuario, así que no se gasta una llamada.
export function huellaModulos(modulos: ModuloReporte[]): string {
  const datos = modulos.map((m) => ({
    totalesPorMes: m.totalesPorMes,
    topProducto: m.topProducto,
    topCliente: m.topCliente,
    sumaTotal: m.sumaTotal,
    flujoCaja: m.flujoCaja,
    metas: m.metas?.map(({ id, ...resto }) => resto), // el id de la meta es aleatorio, no un dato real
  }));
  return createHash("sha256").update(JSON.stringify(datos)).digest("hex");
}
