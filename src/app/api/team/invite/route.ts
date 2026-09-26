import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

// Invita por email a un miembro de la empresa. Solo dueno/admin puede hacerlo
// (la policy RLS de "miembros" ya lo exige, pero lo validamos antes también
// para devolver un error claro en vez de un fallo silencioso de RLS).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, email, rol } = await req.json();
  if (!empresaId || !email || !["admin", "miembro"].includes(rol)) {
    return NextResponse.json({ error: "Faltan datos: empresaId, email, rol (admin|miembro)" }, { status: 400 });
  }

  const { data: miMembresia } = await supabase
    .from("miembros")
    .select("rol")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .single();

  if (!miMembresia || !["dueno", "admin"].includes(miMembresia.rol)) {
    return NextResponse.json({ error: "No tienes permiso para invitar en esta empresa" }, { status: 403 });
  }

  // Invitar más gente es una feature de pago (el plan gratis es 1 solo usuario).
  if (!(await tieneSuscripcionActiva(supabase, empresaId))) {
    return NextResponse.json(
      { error: "Invitar miembros es parte del plan pago. Activa tu suscripción para agregar gente al equipo." },
      { status: 402 }
    );
  }

  const admin = crearClienteAdmin();

  // Busca si el email ya tiene cuenta; si no, la crea y le manda invitación.
  const { data: existentes } = await admin.auth.admin.listUsers();
  let invitadoId = existentes?.users.find((u) => u.email === email)?.id;

  if (!invitadoId) {
    const { data: invitado, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(email);
    if (errorInvite || !invitado.user) {
      return NextResponse.json({ error: errorInvite?.message ?? "No se pudo invitar" }, { status: 500 });
    }
    invitadoId = invitado.user.id;
  }

  const { error: errorMiembro } = await admin
    .from("miembros")
    .insert({ empresa_id: empresaId, user_id: invitadoId, rol });

  if (errorMiembro) {
    if (errorMiembro.code === "23505") {
      return NextResponse.json({ error: "Ese usuario ya es miembro de la empresa" }, { status: 409 });
    }
    return NextResponse.json({ error: errorMiembro.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
