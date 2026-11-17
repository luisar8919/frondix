import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Borrar un adjunto: requiere dueño/admin (acción un poco más delicada que
// subir uno, mismo criterio de "zona de riesgo" que otras acciones de borrado).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: adjunto } = await supabase.from("adjuntos").select("empresa_id, ruta_storage").eq("id", id).single();
  if (!adjunto) return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });

  const { data: miMembresia } = await supabase.from("miembros").select("rol").eq("empresa_id", adjunto.empresa_id).eq("user_id", user.id).single();
  if (!miMembresia || !["dueno", "admin"].includes(miMembresia.rol)) {
    return NextResponse.json({ error: "Solo el dueño o un administrador puede borrar adjuntos" }, { status: 403 });
  }

  const admin = crearClienteAdmin();
  await admin.storage.from("adjuntos").remove([adjunto.ruta_storage]);
  const { error } = await admin.from("adjuntos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
