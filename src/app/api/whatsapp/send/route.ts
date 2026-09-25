import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { enviarTexto } from "@/lib/whatsapp";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

// Endpoint manual para probar el envío desde la UI (ej. botón "recordar" en un record).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, telefono, mensaje } = await req.json();
  if (!empresaId || !telefono || !mensaje) {
    return NextResponse.json({ error: "Faltan datos: empresaId, telefono, mensaje" }, { status: 400 });
  }

  // Los recordatorios por WhatsApp son una feature de pago.
  if (!(await tieneSuscripcionActiva(supabase, empresaId))) {
    return NextResponse.json(
      { error: "Los recordatorios por WhatsApp son parte del plan pago." },
      { status: 402 }
    );
  }

  try {
    await enviarTexto(telefono, mensaje);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error enviando" }, { status: 502 });
  }
}
