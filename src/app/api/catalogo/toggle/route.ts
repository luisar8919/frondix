import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Prender/apagar el catálogo público (ver /catalogo/[empresaId]). Apagado por
// defecto: nadie de afuera ve precios ni stock hasta que el dueño lo active.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, activo } = await req.json().catch(() => ({}));
  if (!empresaId || typeof activo !== "boolean") {
    return NextResponse.json({ error: "Faltan datos: empresaId, activo" }, { status: 400 });
  }

  const { data: miMembresia } = await supabase
    .from("miembros")
    .select("rol")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .single();
  if (!miMembresia || !["dueno", "admin"].includes(miMembresia.rol)) {
    return NextResponse.json({ error: "No tienes permiso para cambiar esto" }, { status: 403 });
  }

  const admin = crearClienteAdmin();
  const { error } = await admin.from("empresas").update({ catalogo_publico: activo }).eq("id", empresaId);
  if (error) {
    const faltaMigracion = error.code === "42703" || error.code === "PGRST204";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 23 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
