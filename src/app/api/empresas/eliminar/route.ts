import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Borra una empresa por completo: datasets, registros, suscripción, metas,
// highlights, miembros, etc se borran en cascada (ver schema.sql). Irreversible
// -- solo el dueño puede hacerlo, el cliente pide confirmar escribiendo el
// nombre antes de llamar esto (ver dashboard/empresa).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId } = await req.json();
  if (!empresaId) return NextResponse.json({ error: "Falta empresaId" }, { status: 400 });

  const { data: miMembresia } = await supabase
    .from("miembros")
    .select("rol")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .single();
  if (!miMembresia || miMembresia.rol !== "dueno") {
    return NextResponse.json({ error: "Solo el dueño puede eliminar la empresa" }, { status: 403 });
  }

  const admin = crearClienteAdmin();
  const { error } = await admin.from("empresas").delete().eq("id", empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
