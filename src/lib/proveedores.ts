import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { agruparClientes, normalizarTexto, formatearNombre, type FilaCruda } from "./seguimiento.ts";
import type { Columna } from "./excel-parser.ts";

const PAGINA = 1000;
const TOPE_FILAS = 20000;

export interface ProveedorLista {
  clave: string;
  nombre: string;
  ultimaFecha: string;
  visitas: number;
  telefono: string | null;
  totalComprado: number;
  manual: boolean; // agregado a mano, todavía sin ninguna compra
}

export interface MovimientoProveedor { datasetNombre: string; fecha: string | null; producto: string | null; monto: number | null }
export interface HistorialProveedor { nombre: string; movimientos: MovimientoProveedor[]; totalComprado: number; cantidadCompras: number }

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

async function leerFilas(supabase: SupabaseClient, datasetId: string, claves: Record<string, string>) {
  const seleccion = Object.entries(claves).map(([alias, clave]) => `${alias}:data->>${clave}`).join(",");
  const filas: Record<string, string | null>[] = [];
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await supabase.from("records").select(seleccion).eq("dataset_id", datasetId).order("id").range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data as unknown as typeof filas));
    if (data.length < PAGINA) break;
  }
  return filas;
}

// Espejo de listaClientes (src/lib/clientes.ts), pero con rol "proveedor" y
// sumando además los proveedores agregados a mano (proveedores_manual) que
// todavía no tienen ninguna compra -- se dedup por el mismo criterio de
// nombre normalizado que agruparClientes.
export async function listaProveedores(supabase: SupabaseClient, empresaId: string): Promise<ProveedorLista[]> {
  const { data: datasets, error } = await supabase.from("datasets").select("id, columnas").eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);

  const totalesPorClave = new Map<string, number>();
  const todasLasFilas: FilaCruda[] = [];

  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    const cProveedor = columnaConRol(columnas, "proveedor");
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));
    if (!cProveedor || !cFecha) continue;
    const cTelefono = columnaConRol(columnas, "telefono");
    const cMonto = columnaConRol(columnas, "monto");

    const filas = await leerFilas(supabase, d.id, {
      c: cProveedor.key,
      f: cFecha.key,
      ...(cTelefono && { t: cTelefono.key }),
      ...(cMonto && { m: cMonto.key }),
    });
    todasLasFilas.push(...(filas as FilaCruda[]));

    for (const f of filas) {
      if (!f.c) continue;
      const monto = Number(f.m);
      if (!Number.isFinite(monto)) continue;
      const clave = normalizarTexto(f.c.toString());
      totalesPorClave.set(clave, (totalesPorClave.get(clave) ?? 0) + monto);
    }
  }

  const deCompras = agruparClientes(todasLasFilas).map((p) => ({
    ...p,
    totalComprado: Math.round((totalesPorClave.get(p.clave) ?? 0) * 100) / 100,
    manual: false,
  }));

  const clavesConCompra = new Set(deCompras.map((p) => p.clave));
  const { data: manuales } = await supabase.from("proveedores_manual").select("clave, nombre, telefono, created_at").eq("empresa_id", empresaId);
  const soloManuales = (manuales ?? [])
    .filter((m) => !clavesConCompra.has(m.clave))
    .map((m) => ({
      clave: m.clave,
      nombre: formatearNombre(m.nombre),
      ultimaFecha: m.created_at.slice(0, 10),
      visitas: 0,
      telefono: m.telefono,
      totalComprado: 0,
      manual: true,
    }));

  return [...deCompras, ...soloManuales].sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));
}

// Espejo de historialCliente (src/lib/historialCliente.ts), rol "proveedor".
export async function historialProveedor(supabase: SupabaseClient, empresaId: string, nombre: string): Promise<HistorialProveedor> {
  const clave = normalizarTexto(nombre);
  const { data: datasets, error } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", empresaId);
  if (error) throw new Error(error.message);

  const movimientos: MovimientoProveedor[] = [];
  for (const d of datasets ?? []) {
    const columnas = d.columnas as Columna[];
    const cProveedor = columnaConRol(columnas, "proveedor");
    if (!cProveedor) continue;
    const cProducto = columnaConRol(columnas, "producto");
    const cMonto = columnaConRol(columnas, "monto");
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));

    const seleccion = [
      `proveedor:data->>${cProveedor.key}`,
      cProducto && `producto:data->>${cProducto.key}`,
      cMonto && `monto:data->>${cMonto.key}`,
      cFecha && `fecha:data->>${cFecha.key}`,
    ].filter(Boolean).join(", ");

    for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
      const { data: records, error: errorRecords } = await supabase.from("records").select(seleccion).eq("dataset_id", d.id).range(desde, desde + PAGINA - 1);
      if (errorRecords) throw new Error(errorRecords.message);
      const filas = (records ?? []) as unknown as { proveedor: string | null; producto?: string | null; monto?: string | null; fecha?: string | null }[];
      for (const f of filas) {
        if (!f.proveedor || normalizarTexto(f.proveedor) !== clave) continue;
        const monto = f.monto !== undefined && f.monto !== null ? Number(f.monto) : null;
        movimientos.push({ datasetNombre: d.nombre, fecha: f.fecha ?? null, producto: f.producto ?? null, monto: monto !== null && Number.isFinite(monto) ? monto : null });
      }
      if (filas.length < PAGINA) break;
    }
  }

  movimientos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const totalComprado = Math.round(movimientos.reduce((s, m) => s + (m.monto ?? 0), 0) * 100) / 100;

  return { nombre, movimientos, totalComprado, cantidadCompras: movimientos.length };
}
