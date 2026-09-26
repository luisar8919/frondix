import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";
import { claveValida } from "@/lib/enlaces";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import {
  agruparClientes, sinVolver, resumenSemana, normalizarTexto, normalizarTelefonoPE, diasDesde,
  type FilaCruda,
} from "@/lib/seguimiento";
import type { Columna } from "@/lib/excel-parser";

const PAGINA = 1000; // Supabase corta cada respuesta en 1000 filas
const TOPE_FILAS = 20000; // por tabla; más que eso hoy no se analiza
const MUESTRA_GRATIS = 3;
const MAX_LISTA = 300;
const DIAS_SIN_INSISTIR = 14; // un cliente contactado hace menos de esto se marca "ya escrito"

// Pide solo las columnas necesarias (no toda la fila): así el análisis casi no gasta transferencia.
async function leerFilas(supabase: SupabaseClient, datasetId: string, claves: Partial<Record<"c" | "f" | "t" | "m", string>>) {
  const seleccion = Object.entries(claves).map(([alias, clave]) => `${alias}:data->>${clave}`).join(",");
  const filas: FilaCruda[] = [];
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await supabase
      .from("records")
      .select(seleccion)
      .eq("dataset_id", datasetId)
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data as unknown as FilaCruda[]));
    if (data.length < PAGINA) break;
  }
  return filas;
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const dias = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get("dias") ?? "30", 10) || 30));
  const ahora = new Date();

  const { data: miembro } = await supabase
    .from("miembros")
    .select("empresa_id, empresas(nombre)")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!miembro) return NextResponse.json({ error: "No tienes una empresa asociada" }, { status: 404 });

  const empresaId = miembro.empresa_id as string;
  const negocio = (miembro.empresas as unknown as { nombre: string } | null)?.nombre ?? "";
  const plan = (await tieneSuscripcionActiva(supabase, empresaId)) ? "activo" : "gratis";

  const { data: datasets, error: errorDatasets } = await supabase
    .from("datasets")
    .select("id, nombre, columnas")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false });
  if (errorDatasets) return NextResponse.json({ error: errorDatasets.message }, { status: 500 });

  // A quién ya se le escribió hace poco (la tabla puede no existir si falta la migración 03).
  const desde = new Date(ahora.getTime() - 60 * 86400000).toISOString();
  const { data: contactos, error: errorContactos } = await supabase
    .from("contactos")
    .select("dataset_id, cliente, created_at")
    .eq("empresa_id", empresaId)
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  const contactosDisponibles = !errorContactos;
  const ultimoContacto = new Map<string, string>();
  for (const c of contactos ?? []) {
    const k = `${c.dataset_id}|${normalizarTexto(c.cliente)}`;
    if (!ultimoContacto.has(k)) ultimoContacto.set(k, c.created_at);
  }

  const tablas = [];
  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    const cCliente = columnaConRol(columnas, "cliente");
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));
    const cTelefono = columnaConRol(columnas, "telefono");
    const cMonto = columnaConRol(columnas, "monto");

    const conSeguimiento = !!(cCliente && cFecha);
    const conResumen = !!(cFecha && cMonto);
    if (!conSeguimiento && !conResumen) continue;

    let filas: FilaCruda[];
    try {
      filas = await leerFilas(supabase, d.id, {
        ...(cCliente && { c: cCliente.key }),
        f: cFecha!.key,
        ...(cTelefono && { t: cTelefono.key }),
        ...(cMonto && { m: cMonto.key }),
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer la tabla" }, { status: 500 });
    }

    let seguimiento = null;
    if (conSeguimiento) {
      const todos = sinVolver(agruparClientes(filas), dias, ahora);
      const lista = todos.slice(0, plan === "activo" ? MAX_LISTA : MUESTRA_GRATIS).map((c) => {
        const ultimo = ultimoContacto.get(`${d.id}|${c.clave}`);
        return {
          clave: c.clave,
          nombre: c.nombre,
          ultimaFecha: c.ultimaFecha,
          dias: c.dias,
          visitas: c.visitas,
          // el teléfono y el envío son parte del plan pago
          telefono: plan === "activo" ? normalizarTelefonoPE(c.telefono) : null,
          // created_at viene en UTC: se pasa a hora de Lima para que el día coincida con diasDesde
          contactadoHaceDias: ultimo ? diasDesde(new Date(Date.parse(ultimo) - 5 * 3600000).toISOString(), ahora) : null,
        };
      });
      seguimiento = {
        totalSinVolver: todos.length,
        clientes: lista,
        tieneTelefono: !!cTelefono,
        diasSinInsistir: DIAS_SIN_INSISTIR,
      };
    }

    tablas.push({
      datasetId: d.id,
      nombre: d.nombre,
      seguimiento,
      resumen: conResumen ? resumenSemana(filas, ahora) : null,
    });
  }

  return NextResponse.json({ negocio, plan, dias, contactosDisponibles, tablas });
}
