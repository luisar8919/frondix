import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { totalesPorMes, topPor, sumaMonto, flujoCaja, progresoMetas } from "./reportes.ts";
import type { Columna } from "./excel-parser.ts";

const PAGINA = 1000; // Supabase corta cada respuesta en 1000 filas
const TOPE_FILAS = 20000; // por módulo; más que eso hoy no se analiza

// Mismo patrón que /api/seguimiento: pide solo las columnas necesarias, paginado.
// `claves` es alias -> key de columna; el alias puede ser cualquier string (se usa
// tanto con los alias fijos f/m/p/c/co como con keys de columnas libres).
async function leerFilas(supabase: SupabaseClient, datasetId: string, claves: Record<string, string>) {
  const seleccion = Object.entries(claves).map(([alias, clave]) => `${alias}:data->>${clave}`).join(",");
  const filas: Record<string, string | null>[] = [];
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
  topProveedor: ReturnType<typeof topPor> | null;
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
    const cProveedor = columnaConRol(columnas, "proveedor");

    const conTotales = !!(cFecha && cMonto);
    const conTopProducto = !!cProducto;
    const conTopCliente = !!cCliente;
    const conTopProveedor = !!cProveedor;
    const conFlujoCaja = !!(cMonto && cCosto);
    const conSumaTotal = !!cMonto && !conTotales && !conFlujoCaja;
    if (!conTotales && !conTopProducto && !conTopCliente && !conTopProveedor && !conSumaTotal && !conFlujoCaja) continue;

    const filas = await leerFilas(supabase, d.id, {
      ...(cFecha && { f: cFecha.key }),
      ...(cMonto && { m: cMonto.key }),
      ...(cCosto && { co: cCosto.key }),
      ...(cProducto && { p: cProducto.key }),
      ...(cCliente && { c: cCliente.key }),
      ...(cProveedor && { pr: cProveedor.key }),
    });

    const plantillas = [
      conFlujoCaja && "flujo_caja",
      conTotales && "ventas_mensuales",
      conTopProducto && "top_productos",
      conTopCliente && "top_clientes",
      conTopProveedor && "top_proveedores",
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
      topProveedor: conTopProveedor ? topPor(filas.map((f) => ({ clave: f.pr, m: f.m })), 5) : null,
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
// `omitirNombresCliente`: "Top clientes" por definición expone nombres (es un ranking
// por cliente) -- para el camino que va a un tercero (Gemini) se arma sin esa línea,
// aunque internamente/en pantalla (donde el dueño ve sus propios datos) sí se muestra.
export function resumenParaIA(modulos: ModuloReporte[], opciones?: { omitirNombresCliente?: boolean }): string {
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
      if (m.topCliente?.length && !opciones?.omitirNombresCliente) {
        lineas.push(`  Top clientes: ${m.topCliente.map((c) => `${c.clave} (${c.total > 0 ? "S/ " + c.total : c.veces + "x"})`).join(", ")}`);
      }
      if (m.topProveedor?.length && !opciones?.omitirNombresCliente) {
        lineas.push(`  Top proveedores: ${m.topProveedor.map((c) => `${c.clave} (${c.total > 0 ? "S/ " + c.total : c.veces + "x"})`).join(", ")}`);
      }
      if (m.metas?.length) lineas.push(`  Metas: ${m.metas.map((x) => `${x.producto} ${x.vendidos}/${x.objetivo}${x.alcanzada ? " lograda" : ""}`).join(", ")}`);
      return lineas.join("\n");
    })
    .join("\n\n");
}

// Columnas sin rol (no son monto/costo/producto/cliente/fecha/teléfono) -- lo que
// el usuario tipeó pero la plataforma no sabe qué significa (edad, zona de entrega,
// talla...). Se resumen por frecuencia (top 5 valores + % de las filas) en vez de
// mandar las filas crudas: mismo patrón útil para la IA, una fracción del texto,
// y cero riesgo de que se cuele un dato sensible fila por fila -- ya nunca se le
// manda un registro completo a Gemini, solo números ya calculados.
const TOPE_VALORES_POR_COLUMNA_LIBRE = 5;

interface ColumnaLibreResumen {
  label: string;
  principales: { valor: string; cantidad: number; porcentaje: number }[];
}

async function agregarColumnasLibres(
  supabase: SupabaseClient,
  datasetId: string,
  columnas: Columna[]
): Promise<ColumnaLibreResumen[]> {
  const libres = columnas.filter((c) => !c.rol && c.tipo === "texto" && claveValida(c.key)).slice(0, 5);
  if (libres.length === 0) return [];

  const claves = Object.fromEntries(libres.map((c) => [c.key, c.key]));
  const filas = await leerFilas(supabase, datasetId, claves);

  return libres
    .map((c) => {
      const conteo = new Map<string, number>();
      let total = 0;
      for (const fila of filas) {
        const v = fila[c.key]?.toString().trim();
        if (!v) continue;
        conteo.set(v, (conteo.get(v) ?? 0) + 1);
        total++;
      }
      const principales = [...conteo.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOPE_VALORES_POR_COLUMNA_LIBRE)
        .map(([valor, cantidad]) => ({ valor, cantidad, porcentaje: Math.round((cantidad / total) * 100) }));
      return { label: c.label, principales };
    })
    .filter((c) => c.principales.length > 0);
}

// Igual que resumenParaIA, pero agrega además el resumen de columnas libres de
// cada módulo (ver arriba). Todo lo que viaja a Gemini es un número o un % ya
// calculado por la plataforma -- nunca una fila ni un nombre de cliente/teléfono.
export async function resumenConLibresParaIA(supabase: SupabaseClient, empresaId: string, modulos: ModuloReporte[]): Promise<string> {
  const agregados = resumenParaIA(modulos, { omitirNombresCliente: true });
  if (modulos.length === 0) return agregados;

  const { data: datasets } = await supabase
    .from("datasets")
    .select("id, columnas")
    .eq("empresa_id", empresaId)
    .in("id", modulos.map((m) => m.datasetId));
  const columnasPorId = new Map((datasets ?? []).map((d) => [d.id, d.columnas as Columna[]]));

  const bloques: string[] = [];
  for (const m of modulos) {
    const columnas = columnasPorId.get(m.datasetId) ?? [];
    const libres = await agregarColumnasLibres(supabase, m.datasetId, columnas);
    if (libres.length === 0) continue;
    const lineas = libres.map((c) => `  ${c.label}: ${c.principales.map((p) => `${p.valor} (${p.porcentaje}%)`).join(", ")}`);
    bloques.push(`Otros datos de "${m.nombre}":\n${lineas.join("\n")}`);
  }

  return bloques.length ? `${agregados}\n\n${bloques.join("\n\n")}` : agregados;
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
    topProveedor: m.topProveedor,
    sumaTotal: m.sumaTotal,
    flujoCaja: m.flujoCaja,
    metas: m.metas?.map(({ id, ...resto }) => resto), // el id de la meta es aleatorio, no un dato real
  }));
  return createHash("sha256").update(JSON.stringify(datos)).digest("hex");
}
