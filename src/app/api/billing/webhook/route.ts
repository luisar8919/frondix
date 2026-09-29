import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { estadoSuscripcion } from "@/lib/culqi";
import { ipDePeticion, limitePorIp } from "@/lib/limiteIp";

// Culqi manda eventos aquí cuando cambia el estado de una suscripción (cobro exitoso,
// cancelación, etc). Ver lista de eventos en https://apidocs.culqi.com/#section/Webhooks.
//
// IMPORTANTE: Culqi no firma estas peticiones (no hay secreto que validar), así que
// cualquiera podría mandar un POST fingiendo un pago exitoso. Por eso nunca se confía
// en lo que dice el body: solo se usa para saber A QUÉ suscripción preguntarle a Culqi,
// y el estado real (activa/cancelada/vencida) sale de esa respuesta verificada, nunca
// del evento recibido.
export async function POST(req: NextRequest) {
  if (!limitePorIp(ipDePeticion(req), 30)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const evento = await req.json().catch(() => null);
  const subscriptionId = evento?.data?.subscription_id ?? evento?.data?.id;
  if (!evento?.type?.startsWith("subscription.") || !subscriptionId) {
    return NextResponse.json({ ok: true }); // evento que no nos importa
  }

  try {
    const status = await estadoSuscripcion(subscriptionId);
    // 1=Creada 2=Periodo de prueba 3=Activa 4=Cancelada 5=En cola 6=Vencida
    const estado = [2, 3].includes(status) ? "activa" : status === 4 ? "cancelada" : status === 6 ? "vencida" : null;
    if (estado) {
      const admin = crearClienteAdmin();
      await admin.from("suscripciones").update({ estado, updated_at: new Date().toISOString() }).eq("culqi_subscription_id", subscriptionId);
    }
  } catch (e) {
    // Si Culqi no confirma el estado, no se toca la base: mejor no actualizar
    // que actualizar con un dato que nadie verificó.
    console.error("No se pudo verificar la suscripción con la API de Culqi:", e);
  }

  return NextResponse.json({ ok: true });
}
