import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { aceptarCotizacion } from "@/lib/cotizaciones";

const ESTADOS_VALIDOS = ["pendiente", "aceptada", "rechazada"];

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
    .select("id")
    .eq("id", id)
    .eq("empresa_id", sesion.empresaId)
    .single();
  if (errorCot || !cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  if (estado !== "aceptada") {
    const { error } = await supabase.from("cotizaciones").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const resultado = await aceptarCotizacion(supabase, sesion.empresaId, id, datasetId, user.email ?? null);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error, datasets: resultado.datasets }, { status: resultado.status });
  return NextResponse.json({ ok: true, ventaDatasetId: resultado.ventaDatasetId });
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
