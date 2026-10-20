import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

const ESTADOS_VALIDOS = ["pendiente", "recibida", "cancelada"];

// Cambiar el estado (recibida/cancelada) -- al marcar "recibida" se guarda la
// fecha de hoy como fecha de recepción.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { estado } = await req.json().catch(() => ({}));
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  const cambios: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
  if (estado === "recibida") cambios.fecha_recepcion = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("ordenes_compra").update(cambios).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { error } = await supabase.from("ordenes_compra").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
