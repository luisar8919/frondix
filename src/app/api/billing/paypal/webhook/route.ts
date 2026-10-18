import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { estadoSuscripcionPaypal } from "@/lib/paypal";
import { ipDePeticion, limitePorIp } from "@/lib/limiteIp";

const EVENTOS_SUSCRIPCION = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
]);

// PayPal manda eventos aquí cuando cambia el estado de una suscripción. Verificar su
// firma pide llamar a una API propia de PayPal igual de costosa que simplemente
// reconsultar el estado -- así que, mismo criterio que el webhook de Culqi: el evento
// solo dice A QUÉ suscripción preguntarle, y el estado real sale de la respuesta
// verificada de la API, nunca de lo que diga el body.
export async function POST(req: NextRequest) {
  if (!limitePorIp(ipDePeticion(req), 30)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const evento = await req.json().catch(() => null);
  if (!evento?.event_type || !EVENTOS_SUSCRIPCION.has(evento.event_type)) {
    return NextResponse.json({ ok: true }); // evento que no nos importa
  }
  const subscriptionId = evento.resource?.id;
  if (!subscriptionId) return NextResponse.json({ ok: true });

  try {
    const { activa, estado: estadoPaypal } = await estadoSuscripcionPaypal(subscriptionId);
    const estado = activa ? "activa" : ["CANCELLED", "EXPIRED"].includes(estadoPaypal) ? "cancelada" : "vencida";
    const admin = crearClienteAdmin();
    const cambios: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
    if (estado === "activa") cambios.prueba_hasta = null;
    await admin.from("suscripciones").update(cambios).eq("paypal_subscription_id", subscriptionId);
  } catch (e) {
    // Si PayPal no confirma el estado, no se toca la base: mejor no actualizar
    // que actualizar con un dato que nadie verificó.
    console.error("No se pudo verificar la suscripción con la API de PayPal:", e);
  }

  return NextResponse.json({ ok: true });
}
