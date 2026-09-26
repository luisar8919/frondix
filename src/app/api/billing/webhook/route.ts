import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Culqi manda eventos aquí cuando cambia el estado de una suscripción
// (cobro exitoso, tarjeta rechazada, cancelación). Ver:
// https://docs.culqi.com/es/documentacion/pagos-online/recurrencia/suscripciones/
export async function POST(req: NextRequest) {
  const evento = await req.json();
  const admin = crearClienteAdmin();

  const subscriptionId = evento?.data?.subscription_id ?? evento?.data?.id;
  if (!subscriptionId) return NextResponse.json({ ok: true }); // evento que no nos importa

  const nuevoEstado =
    evento.type === "charge.succeeded" || evento.type === "subscription.charge.succeeded"
      ? "activa"
      : evento.type === "subscription.cancelled"
      ? "cancelada"
      : evento.type === "charge.failed"
      ? "vencida"
      : null;

  if (nuevoEstado) {
    await admin
      .from("suscripciones")
      .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
      .eq("culqi_subscription_id", subscriptionId);
  }

  return NextResponse.json({ ok: true });
}
