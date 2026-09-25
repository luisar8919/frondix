import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearSuscripcionConTarjeta, crearCargoYape } from "@/lib/culqi";

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, metodo, token, montoCentimos } = await req.json();
  if (!empresaId || !token || !["tarjeta", "yape"].includes(metodo)) {
    return NextResponse.json({ error: "Faltan datos: empresaId, metodo (tarjeta|yape), token" }, { status: 400 });
  }

  try {
    if (metodo === "tarjeta") {
      const { customerId, subscriptionId } = await crearSuscripcionConTarjeta(user.email, token);
      await supabase.from("suscripciones").upsert({
        empresa_id: empresaId,
        culqi_customer_id: customerId,
        culqi_subscription_id: subscriptionId,
        estado: "activa",
      });
      return NextResponse.json({ ok: true, tipo: "suscripcion_automatica" });
    }

    // Yape: cargo único de este mes; no queda suscripción recurrente automática.
    await crearCargoYape(user.email, token, montoCentimos ?? 3500 * 100);
    await supabase.from("suscripciones").upsert({
      empresa_id: empresaId,
      estado: "activa",
    });
    return NextResponse.json({ ok: true, tipo: "cargo_manual_mensual" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error de pago" }, { status: 402 });
  }
}
