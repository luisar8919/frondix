import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { aceptarCotizacion } from "@/lib/cotizaciones";

// Sin login: el cliente llega desde el link de WhatsApp con ?token=... (ver
// enlaceWhatsApp en Cotizaciones.tsx). El token hace de contraseña de un solo
// uso para ESA cotización -- por eso acá sí hace falta el cliente admin
// (service_role, salta RLS), nunca se expone nada fuera de esta fila.
async function cotizacionConToken(id: string, token: string | null) {
  if (!token) return null;
  const admin = crearClienteAdmin();
  const { data } = await admin
    .from("cotizaciones")
    .select("id, empresa_id, cliente, producto, monto, fecha, estado, token")
    .eq("id", id)
    .single();
  if (!data || data.token !== token) return null;
  return { admin, cot: data };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("token");
  const encontrada = await cotizacionConToken(id, token);
  if (!encontrada) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  const { cot } = encontrada;
  return NextResponse.json({
    cotizacion: { cliente: cot.cliente, producto: cot.producto, monto: cot.monto, fecha: cot.fecha, estado: cot.estado },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { token, estado } = await req.json().catch(() => ({}));
  if (estado !== "aceptada" && estado !== "rechazada") return NextResponse.json({ error: "Estado inválido" }, { status: 400 });

  const encontrada = await cotizacionConToken(id, token);
  if (!encontrada) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  const { admin, cot } = encontrada;
  if (cot.estado !== "pendiente") return NextResponse.json({ error: "Esta cotización ya fue respondida" }, { status: 422 });

  if (estado === "rechazada") {
    const { error } = await admin.from("cotizaciones").update({ estado: "rechazada", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const resultado = await aceptarCotizacion(admin, cot.empresa_id, id, undefined, null);
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status === 409 ? 422 : resultado.status });
  return NextResponse.json({ ok: true });
}
