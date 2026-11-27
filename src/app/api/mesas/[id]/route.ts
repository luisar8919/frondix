import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";

// Actualiza el carrito/cliente/ambiente de una mesa ya abierta -- se llama
// después de cada cambio en el carrito del Punto de Venta (agregar línea,
// cambiar cantidad, etc.), así otro dispositivo que mire la misma mesa ve lo
// mismo. Nunca cambia mozo_user_id/mozo_email: quién abrió la mesa queda fijo.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { carrito, cliente, ambiente, nombre } = await req.json().catch(() => ({}));
  const cambios: Record<string, unknown> = {};
  if (carrito !== undefined) cambios.carrito = carrito;
  if (cliente !== undefined) cambios.cliente = cliente;
  if (ambiente !== undefined) cambios.ambiente = ambiente;
  if (nombre !== undefined) cambios.nombre = nombre;
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: "No hay nada que actualizar" }, { status: 400 });

  const { data, error } = await supabase
    .from("mesas")
    .update(cambios)
    .eq("id", id)
    .eq("empresa_id", sesion.empresaId)
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Mesa no encontrada" }, { status: error ? 500 : 404 });

  return NextResponse.json({ ok: true });
}

// Cierra la mesa (cobrada, o liberada manualmente) -- se borra, no queda
// histórico acá: el histórico real de la venta ya quedó en Ventas al cobrar.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { error } = await supabase.from("mesas").delete().eq("id", id).eq("empresa_id", sesion.empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
