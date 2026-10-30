import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { misEmpresas } from "@/lib/sesion";

// Borra la cuenta del usuario que llama (nunca la de otro). Dos reglas:
// - Si es dueño de una empresa donde hay más gente en el equipo, se bloquea
//   TODO antes de tocar nada -- no tiene sentido dejar a un equipo sin dueño.
// - Si es dueño único de una empresa, esa empresa se borra entera con él
//   (datasets, registros, suscripción). Si solo es miembro/admin/vendedor en
//   otras, simplemente sale de esas, no se tocan.
// Al final se usa supabase.auth.admin.deleteUser (borrado real, no "soft
// delete"): el email queda libre como si la cuenta nunca hubiera existido,
// así que un signup nuevo con el mismo correo manda confirmación de verdad.
export async function POST() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const admin = crearClienteAdmin();
  const empresas = await misEmpresas(supabase, user.id);
  const propias = empresas.filter((e) => e.rol === "dueno");

  const bloqueantes: string[] = [];
  for (const e of propias) {
    const { count } = await admin.from("miembros").select("user_id", { count: "exact", head: true }).eq("empresa_id", e.empresaId);
    if ((count ?? 0) > 1) bloqueantes.push(e.nombre);
  }
  if (bloqueantes.length > 0) {
    return NextResponse.json(
      { error: `Eres dueño de "${bloqueantes.join('", "')}" y tiene más gente en el equipo. Quita al resto del equipo antes de eliminar tu cuenta.` },
      { status: 422 }
    );
  }

  for (const e of propias) {
    const { data: datasets } = await admin.from("datasets").select("id").eq("empresa_id", e.empresaId);
    for (const d of datasets ?? []) await admin.from("records").delete().eq("dataset_id", d.id);
    await admin.from("datasets").delete().eq("empresa_id", e.empresaId);
    await admin.from("suscripciones").delete().eq("empresa_id", e.empresaId);
    await admin.from("miembros").delete().eq("empresa_id", e.empresaId);
    await admin.from("empresas").delete().eq("id", e.empresaId);
  }
  for (const e of empresas.filter((e) => e.rol !== "dueno")) {
    await admin.from("miembros").delete().eq("empresa_id", e.empresaId).eq("user_id", user.id);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
