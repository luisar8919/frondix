import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { verificarFirmaPaddle } from "@/lib/paddle";
import { ipDePeticion, limitePorIp } from "@/lib/limiteIp";

const ACTIVA = new Set(["active", "trialing"]);
const CANCELADA = new Set(["canceled", "paused"]);

// A diferencia de Culqi/PayPal, Paddle SÍ firma el webhook (header Paddle-Signature) --
// se verifica esa firma y, a partir de ahí, se confía directo en el estado que manda
// el evento, sin necesitar una segunda llamada a la API para reconfirmar.
export async function POST(req: NextRequest) {
  if (!limitePorIp(ipDePeticion(req), 30)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const cuerpoCrudo = await req.text();
  if (!verificarFirmaPaddle(req.headers.get("paddle-signature"), cuerpoCrudo)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const evento = JSON.parse(cuerpoCrudo);
  if (!evento.event_type?.startsWith("subscription.")) return NextResponse.json({ ok: true });

  const data = evento.data;
  const subscriptionId = data?.id;
  if (!subscriptionId) return NextResponse.json({ ok: true });
  const empresaId = data?.custom_data?.empresaId;

  const estado = ACTIVA.has(data.status) ? "activa" : CANCELADA.has(data.status) ? "cancelada" : "vencida";
  const admin = crearClienteAdmin();
  const cambios: Record<string, unknown> = {
    estado,
    updated_at: new Date().toISOString(),
    pasarela: "paddle",
    paddle_subscription_id: subscriptionId,
  };
  if (estado === "activa") cambios.prueba_hasta = null;

  // El primer evento de una suscripción nueva todavía no tiene fila para hacer match
  // por paddle_subscription_id -- por eso el upsert es por empresa_id, que viaja en
  // custom_data desde que se abrió el checkout (ver dashboard/billing/page.tsx).
  if (empresaId) {
    await admin.from("suscripciones").upsert({ empresa_id: empresaId, ...cambios }, { onConflict: "empresa_id" });
  } else {
    await admin.from("suscripciones").update(cambios).eq("paddle_subscription_id", subscriptionId);
  }

  return NextResponse.json({ ok: true });
}
