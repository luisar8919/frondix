import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { agruparClientes, normalizarTexto, type FilaCruda, type ClienteResumen } from "./seguimiento.ts";
import type { Columna } from "./excel-parser.ts";

const PAGINA = 1000;
const TOPE_FILAS = 20000;

export interface ClienteLista extends ClienteResumen {
  totalGastado: number;
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

async function leerFilas(supabase: SupabaseClient, datasetId: string, claves: Partial<Record<"c" | "f" | "t" | "m", string>>) {
  const seleccion = Object.entries(claves).map(([alias, clave]) => `${alias}:data->>${clave}`).join(",");
  const filas: (FilaCruda & { m?: string | null })[] = [];
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await supabase.from("records").select(seleccion).eq("dataset_id", datasetId).order("id").range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data as unknown as typeof filas));
    if (data.length < PAGINA) break;
  }
  return filas;
}

// La ficha de cliente de Frondix: todos los clientes de cualquier módulo de
// Ventas, juntados por nombre (mismo criterio que Seguimiento), con cuánto
// gastó cada uno en total. Es el mismo dato que ya usa Seguimiento, pero sin el
// filtro de "no volvió" -- acá se quiere la lista completa.
export async function listaClientes(supabase: SupabaseClient, empresaId: string): Promise<ClienteLista[]> {
  const { data: datasets, error } = await supabase.from("datasets").select("id, columnas").eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);

  const totalesPorClave = new Map<string, number>();
  const todasLasFilas: FilaCruda[] = [];

  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    const cCliente = columnaConRol(columnas, "cliente");
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));
    if (!cCliente || !cFecha) continue;
    const cTelefono = columnaConRol(columnas, "telefono");
    const cMonto = columnaConRol(columnas, "monto");

    const filas = await leerFilas(supabase, d.id, {
      c: cCliente.key,
      f: cFecha.key,
      ...(cTelefono && { t: cTelefono.key }),
      ...(cMonto && { m: cMonto.key }),
    });
    todasLasFilas.push(...filas);

    for (const f of filas) {
      if (!f.c) continue;
      const monto = Number(f.m);
      if (!Number.isFinite(monto)) continue;
      const clave = normalizarTexto(f.c.toString());
      totalesPorClave.set(clave, (totalesPorClave.get(clave) ?? 0) + monto);
    }
  }

  return agruparClientes(todasLasFilas)
    .map((c) => ({ ...c, totalGastado: Math.round((totalesPorClave.get(c.clave) ?? 0) * 100) / 100 }))
    .sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));
}
