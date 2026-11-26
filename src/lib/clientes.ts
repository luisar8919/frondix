import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { agruparClientes, normalizarTexto, formatearNombre, type FilaCruda, type ClienteResumen } from "./seguimiento.ts";
import type { Columna } from "./excel-parser.ts";
import { leerTodasLasFilas } from "./paginacion.ts";

export interface ClienteLista extends ClienteResumen {
  totalGastado: number;
  manual: boolean; // agregado a mano, todavía sin ninguna compra
}

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));
// Fallback para módulos tipo Reservas/Órdenes de servicio: su columna "cliente"
// nace con rol null a propósito (ver plantillasModulo.ts, para no clasificar
// como "ventas" en Reportes) -- pero para ESTA lista (relación con el cliente,
// no dinero) sí queremos verlos. Nunca se usa en reportes/cobranzas, solo acá
// y en historialCliente.ts.
const columnaClienteAmplia = (columnas: Columna[]) =>
  columnaConRol(columnas, "cliente") ?? columnas.find((c) => c.key === "cliente" && claveValida(c.key));

async function leerFilas(supabase: SupabaseClient, datasetId: string, claves: Partial<Record<"c" | "f" | "t" | "m", string>>) {
  const seleccion = Object.entries(claves).map(([alias, clave]) => `${alias}:data->>${clave}`).join(",");
  return leerTodasLasFilas<FilaCruda & { m?: string | null }>((desde, hasta) =>
    supabase.from("records").select(seleccion).eq("dataset_id", datasetId).order("id").range(desde, hasta)
  );
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
    const cCliente = columnaClienteAmplia(columnas);
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));
    if (!cCliente || !cFecha) continue;
    const cTelefono = columnaConRol(columnas, "telefono");
    const cMonto = columnaConRol(columnas, "monto") ?? columnaConRol(columnas, "costo");

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

  const deVentas = agruparClientes(todasLasFilas).map((c) => ({
    ...c,
    totalGastado: Math.round((totalesPorClave.get(c.clave) ?? 0) * 100) / 100,
    manual: false,
  }));

  // El teléfono editado a mano (clientes_manual) gana sobre el que vino en
  // alguna fila de Ventas -- es el único lugar donde el usuario puede corregirlo
  // de verdad (una fila de Ventas vieja no se reescribe sola al editar acá),
  // mismo criterio que listaProveedores.
  const clavesConCompra = new Set(deVentas.map((c) => c.clave));
  const { data: manuales } = await supabase.from("clientes_manual").select("clave, nombre, telefono, created_at").eq("empresa_id", empresaId);
  const manualesPorClave = new Map((manuales ?? []).map((m) => [m.clave, m]));

  const deVentasConTelefono = deVentas.map((c) => {
    const manual = manualesPorClave.get(c.clave);
    return manual?.telefono ? { ...c, telefono: manual.telefono } : c;
  });

  const soloManuales = (manuales ?? [])
    .filter((m) => !clavesConCompra.has(m.clave))
    .map((m) => ({
      clave: m.clave,
      nombre: formatearNombre(m.nombre),
      ultimaFecha: m.created_at.slice(0, 10),
      visitas: 0,
      telefono: m.telefono,
      totalGastado: 0,
      manual: true,
    }));

  return [...deVentasConTelefono, ...soloManuales].sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));
}
