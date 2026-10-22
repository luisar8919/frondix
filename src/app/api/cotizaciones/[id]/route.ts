import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { tipoModulo } from "@/lib/roles";
import { ajustarStockDesdeRegistro } from "@/lib/stock";
import { claveValida } from "@/lib/enlaces";
import type { Columna } from "@/lib/excel-parser";

const ESTADOS_VALIDOS = ["pendiente", "aceptada", "rechazada"];
const columnaConRol = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol && claveValida(c.key));

// Cambiar el estado. "Aceptada" dispara la conversión real: crea el registro
// en un módulo de Ventas con los mismos datos de la cotización. Si hay más de
// un módulo de Ventas, el cliente debe mandar `datasetId` (se le pide elegir
// en la UI); con exactamente uno, se usa ese solo. Simplificación consciente:
// no pasa por /api/records (que valida enlaces y autocrea cliente/producto
// enlazados) -- si Ventas tiene columnas enlazadas estrictas, puede hacer
// falta cargar el cliente/producto a mano después. El ajuste de stock si se
// hace, igual que una venta normal.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { estado, datasetId } = await req.json().catch(() => ({}));
  if (!ESTADOS_VALIDOS.includes(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  const { data: cot, error: errorCot } = await supabase
    .from("cotizaciones")
    .select("id, cliente, producto, monto, fecha, estado")
    .eq("id", id)
    .eq("empresa_id", sesion.empresaId)
    .single();
  if (errorCot || !cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  if (estado !== "aceptada") {
    const { error } = await supabase.from("cotizaciones").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (cot.estado === "aceptada") return NextResponse.json({ error: "Esta cotización ya fue aceptada" }, { status: 422 });

  const { data: datasets } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", sesion.empresaId);
  const deVentas = (datasets ?? []).filter((d) => tipoModulo((d.columnas as Columna[]).map((c) => c.rol)) === "ventas");
  if (deVentas.length === 0) {
    return NextResponse.json({ error: "Primero crea un módulo de Ventas para poder aceptar cotizaciones." }, { status: 422 });
  }
  if (deVentas.length > 1 && !datasetId) {
    return NextResponse.json({ error: "Elige a qué módulo de Ventas va", datasets: deVentas.map((d) => ({ id: d.id, nombre: d.nombre })) }, { status: 409 });
  }
  const elegido = deVentas.length === 1 ? deVentas[0] : deVentas.find((d) => d.id === datasetId);
  if (!elegido) return NextResponse.json({ error: "Ese módulo de Ventas ya no existe" }, { status: 422 });

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
    .insert({ dataset_id: elegido.id, data: datosVenta, updated_by: user.email ?? null })
    .select("id")
    .single();
  if (errorRecord) return NextResponse.json({ error: errorRecord.message }, { status: 500 });

  try {
    await ajustarStockDesdeRegistro(supabase, sesion.empresaId, columnas, datosVenta, 1, user.id);
  } catch {
    // mejor esfuerzo, igual que en /api/records -- la venta ya quedó guardada
  }

  const { error: errorUpdate } = await supabase
    .from("cotizaciones")
    .update({ estado: "aceptada", venta_dataset_id: elegido.id, venta_record_id: record.id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  return NextResponse.json({ ok: true, ventaDatasetId: elegido.id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { error } = await supabase.from("cotizaciones").delete().eq("id", id).eq("empresa_id", sesion.empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
