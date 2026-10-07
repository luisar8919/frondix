import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Lista/edita el equipo de una empresa. Solo dueño/admin puede ver o tocar esto
// (misma regla que /api/team/invite). El dueño nunca se toca desde acá (ni se
// puede quitar ni cambiarle el rol): transferir la empresa es otra conversación,
// no algo que se resuelva con un botón de "quitar".
async function puedeGestionar(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, userId: string, empresaId: string) {
  const { data } = await supabase.from("miembros").select("rol").eq("empresa_id", empresaId).eq("user_id", userId).single();
  return !!data && ["dueno", "admin"].includes(data.rol);
}

export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  if (!empresaId) return NextResponse.json({ error: "Falta empresaId" }, { status: 400 });
  if (!(await puedeGestionar(supabase, user.id, empresaId))) {
    return NextResponse.json({ error: "No tienes permiso para ver el equipo de esta empresa" }, { status: 403 });
  }

  const { data: miembros, error } = await supabase
    .from("miembros")
    .select("user_id, rol, created_at")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // El email vive en auth.users, no en "miembros" -- se resuelve con el cliente
  // de servicio, que es el único que puede leer esa tabla.
  const admin = crearClienteAdmin();
  const { data: usuarios } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailPorId = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return NextResponse.json({
    miembros: miembros.map((m) => ({ userId: m.user_id, rol: m.rol, email: emailPorId.get(m.user_id) ?? "" })),
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, userId, rol } = await req.json();
  if (!empresaId || !userId || !["admin", "miembro"].includes(rol)) {
    return NextResponse.json({ error: "Faltan datos: empresaId, userId, rol (admin|miembro)" }, { status: 400 });
  }
  if (!(await puedeGestionar(supabase, user.id, empresaId))) {
    return NextResponse.json({ error: "No tienes permiso para editar el equipo de esta empresa" }, { status: 403 });
  }

  const admin = crearClienteAdmin();
  const { data: actualizado, error } = await admin
    .from("miembros")
    .update({ rol })
    .eq("empresa_id", empresaId)
    .eq("user_id", userId)
    .neq("rol", "dueno") // el dueño no se toca desde acá
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!actualizado) return NextResponse.json({ error: "No se pudo cambiar ese rol (¿es el dueño?)" }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, userId } = await req.json();
  if (!empresaId || !userId) return NextResponse.json({ error: "Faltan datos: empresaId, userId" }, { status: 400 });

  // Cualquiera puede quitarse a sí mismo (salir de la empresa); quitar a otro
  // requiere ser dueño/admin ahí.
  const esUnoMismo = userId === user.id;
  if (!esUnoMismo && !(await puedeGestionar(supabase, user.id, empresaId))) {
    return NextResponse.json({ error: "No tienes permiso para quitar gente de esta empresa" }, { status: 403 });
  }

  const admin = crearClienteAdmin();
  const { data: borrado, error } = await admin
    .from("miembros")
    .delete()
    .eq("empresa_id", empresaId)
    .eq("user_id", userId)
    .neq("rol", "dueno") // el dueño no se puede quitar (ni a sí mismo) desde acá
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!borrado) return NextResponse.json({ error: "No se pudo quitar a esa persona (¿es el dueño?)" }, { status: 400 });

  return NextResponse.json({ ok: true });
}
