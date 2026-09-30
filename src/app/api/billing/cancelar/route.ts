import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { cancelarSuscripcion } from "@/lib/culqi";

// Pasarse al plan gratis: cancela el cobro recurrente en Culqi (si lo hay, ej. no
// para quien paga por Yape) y marca la suscripción como cancelada en la base.
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
    .select("culqi_subscription_id, estado")
    .eq("empresa_id", empresaId)
    .single();

  if (!suscripcion || suscripcion.estado !== "activa") {
    return NextResponse.json({ error: "Esta empresa no tiene una suscripción activa" }, { status: 400 });
  }

  // Con tarjeta hay cobro recurrente que cancelar en Culqi; con Yape el cargo fue
  // único y no queda nada recurrente ahí, solo se actualiza el estado local.
  if (suscripcion.culqi_subscription_id) {
    try {
      await cancelarSuscripcion(suscripcion.culqi_subscription_id);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cancelar en Culqi" }, { status: 502 });
    }
  }

  const { error } = await admin
    .from("suscripciones")
    .update({ estado: "cancelada", updated_at: new Date().toISOString() })
    .eq("empresa_id", empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
