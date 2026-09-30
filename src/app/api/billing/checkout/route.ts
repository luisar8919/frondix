import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearSuscripcionConTarjeta, crearCargoYape } from "@/lib/culqi";

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, metodo, token, montoCentimos } = await req.json();
  if (!empresaId || !token || !["tarjeta", "yape"].includes(metodo)) {
    return NextResponse.json({ error: "Faltan datos: empresaId, metodo (tarjeta|yape), token" }, { status: 400 });
  }

  // La tabla suscripciones no tiene policy de insert/update para el usuario (solo
  // el servidor la escribe, ver schema.sql) — el cliente de sesión no puede
  // guardar el pago aunque Culqi lo haya aprobado. Se usa el cliente de servicio.
  const admin = crearClienteAdmin();

  try {
    if (metodo === "tarjeta") {
      const { customerId, subscriptionId } = await crearSuscripcionConTarjeta(user.email, token);
      const { error } = await admin.from("suscripciones").upsert({
        empresa_id: empresaId,
        culqi_customer_id: customerId,
        culqi_subscription_id: subscriptionId,
        estado: "activa",
      }, { onConflict: "empresa_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, tipo: "suscripcion_automatica" });
    }

    // Yape: cargo único de este mes; no queda suscripción recurrente automática.
    await crearCargoYape(user.email, token, montoCentimos ?? 3500 * 100);
    const { error } = await admin.from("suscripciones").upsert({
      empresa_id: empresaId,
      estado: "activa",
    }, { onConflict: "empresa_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, tipo: "cargo_manual_mensual" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error de pago" }, { status: 402 });
  }
}
