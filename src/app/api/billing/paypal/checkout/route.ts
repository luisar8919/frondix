import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { estadoSuscripcionPaypal } from "@/lib/paypal";

// El botón de PayPal (SDK del lado del cliente) crea la suscripción y la aprueba el
// usuario ahí mismo -- esto solo confirma con la API de PayPal que de verdad quedó
// ACTIVA antes de guardarla (nunca se confía en lo que diga el navegador).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, subscriptionId } = await req.json().catch(() => ({}));
  if (!empresaId || !subscriptionId) {
    return NextResponse.json({ error: "Faltan datos: empresaId, subscriptionId" }, { status: 400 });
  }

  try {
    const { activa } = await estadoSuscripcionPaypal(subscriptionId);
    if (!activa) return NextResponse.json({ error: "PayPal no confirma la suscripción como activa todavía" }, { status: 402 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo verificar con PayPal" }, { status: 502 });
  }

  const admin = crearClienteAdmin();
  const { error } = await admin.from("suscripciones").upsert({
    empresa_id: empresaId,
    pasarela: "paypal",
    paypal_subscription_id: subscriptionId,
    estado: "activa",
    prueba_hasta: null,
  }, { onConflict: "empresa_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
