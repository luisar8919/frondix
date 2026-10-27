import type { SupabaseClient } from "@supabase/supabase-js";
import { tipoModulo } from "./roles.ts";
import { ajustarStockDesdeRegistro } from "./stock.ts";
import { claveValida } from "./enlaces.ts";
import type { Columna } from "./excel-parser.ts";

type Resultado = { ok: true; ventaDatasetId: string } | { ok: false; error: string; status: number; datasets?: { id: string; nombre: string }[] };

const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

// Convierte una cotización "pendiente" en una venta real. La usan tanto el
// PATCH autenticado (/api/cotizaciones/[id]) como la aceptación pública por
// link de WhatsApp (/api/cotizaciones/publica/[id]) -- misma lógica, un solo
// lugar. `updatedBy` es quien queda como autor de la venta (null en el flujo
// público, el cliente no tiene cuenta).
export async function aceptarCotizacion(
  supabase: SupabaseClient,
  empresaId: string,
  cotizacionId: string,
  datasetId: string | undefined,
  updatedBy: string | null
): Promise<Resultado> {
  const { data: cot, error: errorCot } = await supabase
    .from("cotizaciones")
    .select("id, cliente, producto, monto, fecha, estado, created_by")
    .eq("id", cotizacionId)
    .eq("empresa_id", empresaId)
    .single();
  if (errorCot || !cot) return { ok: false, error: "Cotización no encontrada", status: 404 };
  if (cot.estado === "aceptada") return { ok: false, error: "Esta cotización ya fue aceptada", status: 422 };

  const { data: datasets } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", empresaId);
  const deVentas = (datasets ?? []).filter((d) => tipoModulo((d.columnas as Columna[]).map((c) => c.rol)) === "ventas");
  if (deVentas.length === 0) {
    return { ok: false, error: "Primero crea un módulo de Ventas para poder aceptar cotizaciones.", status: 422 };
  }
  if (deVentas.length > 1 && !datasetId) {
    return { ok: false, error: "Elige a qué módulo de Ventas va", status: 409, datasets: deVentas.map((d) => ({ id: d.id, nombre: d.nombre })) };
  }
  const elegido = deVentas.length === 1 ? deVentas[0] : deVentas.find((d) => d.id === datasetId);
  if (!elegido) return { ok: false, error: "Ese módulo de Ventas ya no existe", status: 422 };

  const columnas = elegido.columnas as Columna[];
  const cCliente = columnaConRol(columnas, "cliente");
  const cProducto = columnaConRol(columnas, "producto");
  const cMonto = columnaConRol(columnas, "monto");
  const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha" && claveValida(c.key));

  const datosVenta: Record<string, unknown> = {};
  if (cCliente) datosVenta[cCliente.key] = cot.cliente;
  if (cProducto) datosVenta[cProducto.key] = cot.producto;
  if (cMonto) datosVenta[cMonto.key] = cot.monto;
  if (cFecha) datosVenta[cFecha.key] = `${cot.fecha}T00:00:00.000Z`;

  const { data: record, error: errorRecord } = await supabase
    .from("records")
    .insert({ dataset_id: elegido.id, data: datosVenta, updated_by: updatedBy })
    .select("id")
    .single();
  if (errorRecord) return { ok: false, error: errorRecord.message, status: 500 };

  try {
    await ajustarStockDesdeRegistro(supabase, empresaId, columnas, datosVenta, 1, cot.created_by);
  } catch {
    // mejor esfuerzo, igual que en /api/records -- la venta ya quedó guardada
  }

  const { error: errorUpdate } = await supabase
    .from("cotizaciones")
    .update({ estado: "aceptada", venta_dataset_id: elegido.id, venta_record_id: record.id, updated_at: new Date().toISOString() })
    .eq("id", cotizacionId);
  if (errorUpdate) return { ok: false, error: errorUpdate.message, status: 500 };

  return { ok: true, ventaDatasetId: elegido.id };
}
