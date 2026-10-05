import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";
import { claveValida } from "@/lib/enlaces";
import { totalesPorMes, topPor, sumaMonto, flujoCaja } from "@/lib/reportes";
import type { Columna } from "@/lib/excel-parser";

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

// Reportes prehechos: para cada módulo con roles marcados, arma solo lo que aplica
// (total por mes si hay Monto+Fecha; top 5 si hay Producto o Cliente). Sin configurar nada.
export async function GET() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: miembro } = await supabase.from("miembros").select("empresa_id").eq("user_id", user.id).limit(1).single();
  if (!miembro) return NextResponse.json({ error: "No tienes una empresa asociada" }, { status: 404 });

  const { data: datasets, error: errorDatasets } = await supabase
    .from("datasets")
    .select("id, nombre, columnas, incluye_igv")
    .eq("empresa_id", miembro.empresa_id)
    .order("created_at", { ascending: false });
  if (errorDatasets) return NextResponse.json({ error: errorDatasets.message }, { status: 500 });

  const ahora = new Date();
  const modulos = [];

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
    // Caso "caja" (ej. Concepto + Entrada, sin columna de fecha): no hay para armar
    // total por mes, pero igual sirve mostrar la suma total del monto. Si ya hay
    // flujo de caja (monto + costo), ese reemplaza a esta suma simple.
    const conSumaTotal = !!cMonto && !conTotales && !conFlujoCaja;
    if (!conTotales && !conTopProducto && !conTopCliente && !conSumaTotal && !conFlujoCaja) continue;

    let filas;
    try {
      filas = await leerFilas(supabase, d.id, {
        ...(cFecha && { f: cFecha.key }),
        ...(cMonto && { m: cMonto.key }),
        ...(cCosto && { co: cCosto.key }),
        ...(cProducto && { p: cProducto.key }),
        ...(cCliente && { c: cCliente.key }),
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer el módulo" }, { status: 500 });
    }

    // Mismas condiciones de arriba, como ids del catálogo de plantillasReporte.ts --
    // para que la pantalla explique "por qué" salió cada reporte sin duplicar la lógica.
    const plantillas = [
      conFlujoCaja && "flujo_caja",
      conTotales && "ventas_mensuales",
      conTopProducto && "top_productos",
      conTopCliente && "top_clientes",
      conSumaTotal && "total_simple",
    ].filter((x): x is string => !!x);

    modulos.push({
      datasetId: d.id,
      nombre: d.nombre,
      plantillas,
      totalesPorMes: conTotales ? totalesPorMes(filas, ahora, 6) : null,
      topProducto: conTopProducto ? topPor(filas.map((f) => ({ clave: f.p, m: f.m })), 5) : null,
      topCliente: conTopCliente ? topPor(filas.map((f) => ({ clave: f.c, m: f.m })), 5) : null,
      sumaTotal: conSumaTotal ? sumaMonto(filas) : null,
      flujoCaja: conFlujoCaja ? flujoCaja(filas.map((f) => ({ m: f.m, costo: f.co })), !!d.incluye_igv) : null,
    });
  }

  return NextResponse.json({ modulos });
}
