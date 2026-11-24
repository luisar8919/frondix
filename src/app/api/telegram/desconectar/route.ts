import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: miMembresia } = await supabase.from("miembros").select("rol").eq("empresa_id", sesion.empresaId).eq("user_id", user!.id).single();
  if (!miMembresia || (miMembresia.rol !== "dueno" && miMembresia.rol !== "admin")) {
    return NextResponse.json({ error: "Solo el dueño o un admin pueden hacer esto" }, { status: 403 });
  }

  const { error } = await supabase.from("empresas").update({ telegram_chat_id: null }).eq("id", sesion.empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
