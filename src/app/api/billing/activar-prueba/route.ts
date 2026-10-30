import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Activa el mes de prueba gratis a pedido del usuario (ya no es automático al
// crear la empresa, ver /api/empresas/create) -- una sola vez por empresa: si
// prueba_hasta ya tiene un valor (esté vencida o no), no se puede volver a
// activar, para que no sirva para extenderla reiniciándola.
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
  if (!miMembresia || !["dueno", "admin"].includes(miMembresia.rol)) {
    return NextResponse.json({ error: "No tienes permiso para cambiar el plan de esta empresa" }, { status: 403 });
  }

  const admin = crearClienteAdmin();
  const { data: suscripcion } = await admin
    .from("suscripciones")
    .select("estado, prueba_hasta")
    .eq("empresa_id", empresaId)
    .single();

  if (suscripcion?.estado === "activa" && !suscripcion.prueba_hasta) {
    return NextResponse.json({ error: "Esta empresa ya tiene el plan pago activo." }, { status: 400 });
  }
  if (suscripcion?.prueba_hasta) {
    return NextResponse.json({ error: "Ya usaste tu mes de prueba gratis en esta empresa." }, { status: 400 });
  }

  const prueba_hasta = new Date();
  prueba_hasta.setMonth(prueba_hasta.getMonth() + 1);
  const { error } = await admin
    .from("suscripciones")
    .update({ estado: "activa", prueba_hasta: prueba_hasta.toISOString(), updated_at: new Date().toISOString() })
    .eq("empresa_id", empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, prueba_hasta: prueba_hasta.toISOString() });
}
