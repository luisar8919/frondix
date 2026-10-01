import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Editar nombre/telefono del negocio desde "Mi cuenta". Solo dueno/admin puede
// hacerlo (mismo criterio que billing/cancelar y team/invite). La tabla
// "empresas" no tiene policy de update para el usuario (solo select, ver
// schema.sql), asi que se escribe con el cliente de servicio.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, nombre, telefono } = await req.json();
  if (!empresaId || !nombre || typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "Falta empresaId o nombre" }, { status: 400 });
  }
  if (!telefono || typeof telefono !== "string" || !/^\d{9}$/.test(telefono)) {
    return NextResponse.json({ error: "El teléfono debe tener 9 dígitos (sin +51)" }, { status: 400 });
  }

  const { data: miMembresia } = await supabase
    .from("miembros")
    .select("rol")
    .eq("empresa_id", empresaId)
    .eq("user_id", user.id)
    .single();
  if (!miMembresia || !["dueno", "admin"].includes(miMembresia.rol)) {
    return NextResponse.json({ error: "No tienes permiso para editar los datos de esta empresa" }, { status: 403 });
  }

  const admin = crearClienteAdmin();
  const { error } = await admin.from("empresas").update({ nombre: nombre.trim(), telefono }).eq("id", empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
