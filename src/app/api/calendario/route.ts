import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { claveValida } from "@/lib/enlaces";
import { agruparPorDia, type FilaCalendario } from "@/lib/calendario";
import type { Columna } from "@/lib/excel-parser";

const PAGINA = 1000; // Supabase corta cada respuesta en 1000 filas
const TOPE_FILAS = 20000; // por módulo; más que eso hoy no se analiza

// Mismo patrón que datosReportes.ts/seguimiento.ts: pide solo las columnas
// necesarias, paginado.
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

// Calendario mensual de cualquier módulo con columna Fecha: reservas, citas,
// entregas, lo que sea -- no es un tipo de módulo aparte, es una vista distinta
// sobre los mismos datos que ya alimentan Reportes.
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const datasetId = req.nextUrl.searchParams.get("datasetId");
  const mesParam = req.nextUrl.searchParams.get("mes"); // "YYYY-MM"
  const m = /^(\d{4})-(\d{2})$/.exec(mesParam ?? "");
  if (!datasetId || !m) return NextResponse.json({ error: "Faltan datos: datasetId, mes (YYYY-MM)" }, { status: 400 });
  const anio = +m[1];
  const mes = +m[2];

  const { data: dataset } = await supabase.from("datasets").select("columnas").eq("id", datasetId).single();
  if (!dataset) return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });

  const columnas = dataset.columnas as Columna[];
  const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));
  if (!cFecha) return NextResponse.json({ error: "Este módulo no tiene una columna de Fecha marcada" }, { status: 422 });
  const cProducto = columnas.find((c) => c.rol === "producto" && claveValida(c.key));
  const cCliente = columnas.find((c) => c.rol === "cliente" && claveValida(c.key));
  const cMonto = columnas.find((c) => c.rol === "monto" && claveValida(c.key));

  const filas = (await leerFilas(supabase, datasetId, {
    f: cFecha.key,
    ...(cProducto && { p: cProducto.key }),
    ...(cCliente && { c: cCliente.key }),
    ...(cMonto && { m: cMonto.key }),
  })) as FilaCalendario[];

  const porDia = agruparPorDia(filas, anio, mes);

  return NextResponse.json({
    dias: Object.fromEntries(porDia),
    columnas: { producto: !!cProducto, cliente: !!cCliente, monto: !!cMonto },
  });
}
