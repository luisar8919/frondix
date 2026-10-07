import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Pasa la propiedad de una empresa a otro miembro que ya está ahí (admin o
// miembro). Solo el dueño actual puede hacerlo. El dueño actual no desaparece,
// queda como admin -- así nunca se pierde acceso por accidente.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, nuevoDuenoId } = await req.json();
  if (!empresaId || !nuevoDuenoId) return NextResponse.json({ error: "Faltan datos: empresaId, nuevoDuenoId" }, { status: 400 });
  if (nuevoDuenoId === user.id) return NextResponse.json({ error: "Ya eres el dueño de esta empresa" }, { status: 400 });

  const { data: miMembresia } = await supabase
    .from("miembros")
    .select("rol")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .single();
  if (!miMembresia || miMembresia.rol !== "dueno") {
    return NextResponse.json({ error: "Solo el dueño puede transferir la empresa" }, { status: 403 });
  }

  const admin = crearClienteAdmin();

  const { data: destino } = await admin
    .from("miembros")
    .select("rol")
    .eq("empresa_id", empresaId)
    .eq("user_id", nuevoDuenoId)
    .single();
  if (!destino) return NextResponse.json({ error: "Esa persona no es miembro de esta empresa" }, { status: 400 });

  const { error: errorNuevo } = await admin
    .from("miembros")
    .update({ rol: "dueno" })
    .eq("empresa_id", empresaId)
    .eq("user_id", nuevoDuenoId);
  if (errorNuevo) return NextResponse.json({ error: errorNuevo.message }, { status: 500 });

  const { error: errorViejo } = await admin
    .from("miembros")
    .update({ rol: "admin" })
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id);
  if (errorViejo) {
    // El dueño actual sigue siendo dueño (esta actualización fue la que falló);
    // revierte al nuevo a su rol de antes para no dejar dos dueños a la vez.
    await admin.from("miembros").update({ rol: destino.rol }).eq("empresa_id", empresaId).eq("user_id", nuevoDuenoId);
    return NextResponse.json({ error: errorViejo.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
