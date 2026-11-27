import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { INTERFACES_DISPONIBLES } from "@/lib/interfaces";

// Prender/apagar una interfaz (Punto de Venta, Atención) desde Configuración >
// Interfaces -- mismo patrón que /api/catalogo/toggle. Apaga/prende la
// interfaz ENTERA (no por módulo individual), guardando su key en
// empresas.interfaces_desactivadas.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, key, activa } = await req.json().catch(() => ({}));
  if (!empresaId || typeof key !== "string" || typeof activa !== "boolean") {
    return NextResponse.json({ error: "Faltan datos: empresaId, key, activa" }, { status: 400 });
  }
  if (!INTERFACES_DISPONIBLES.some((i) => i.key === key)) {
    return NextResponse.json({ error: "Interfaz desconocida" }, { status: 400 });
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
  const { data: empresa, error: errorLeer } = await admin
    .from("empresas")
    .select("interfaces_desactivadas")
    .eq("id", empresaId)
    .single();
  if (errorLeer) {
    const faltaMigracion = errorLeer.code === "42703" || errorLeer.code === "PGRST204";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 44 en Supabase." : errorLeer.message }, { status: 500 });
  }

  const actuales = new Set((empresa?.interfaces_desactivadas as string[] | null) ?? []);
  if (activa) actuales.delete(key); else actuales.add(key);

  const { error } = await admin.from("empresas").update({ interfaces_desactivadas: Array.from(actuales) }).eq("id", empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
