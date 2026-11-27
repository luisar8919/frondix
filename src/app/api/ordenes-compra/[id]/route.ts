import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { rolRestringido, rolEnEmpresa } from "@/lib/permisos";

const ESTADOS_VALIDOS = ["pendiente", "recibida", "cancelada"];

// Mismo chequeo de rol que /api/ordenes-compra (GET/POST) -- faltaba acá,
// y la policy de RLS de `ordenes_compra` solo exige ser miembro de la
// empresa (sin distinguir rol), así que sin este chequeo un vendedor podía
// cambiar el estado o borrar una orden de compra directo por su id.
async function bloquearVendedor(supabase: Awaited<ReturnType<typeof crearClienteServidor>>) {
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (rolRestringido(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }
  return null;
}

// Cambiar el estado (recibida/cancelada) -- al marcar "recibida" se guarda la
// fecha de hoy como fecha de recepción.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const bloqueo = await bloquearVendedor(supabase);
  if (bloqueo) return bloqueo;

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
  const bloqueo = await bloquearVendedor(supabase);
  if (bloqueo) return bloqueo;

  const { error } = await supabase.from("ordenes_compra").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
