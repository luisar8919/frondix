import { NextRequest, NextResponse } from "next/server";
import { ipDePeticion, limitePorIp } from "@/lib/limiteIp";

// Meta llama a este GET una sola vez, al configurar el webhook en su panel,
// para confirmar que el dueño del endpoint eres tú.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const modo = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (modo === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Token de verificación inválido" }, { status: 403 });
}

// Aquí llegan los mensajes entrantes de clientes. MVP: solo los logueamos;
// el siguiente paso natural es guardarlos como nota en el record del cliente.
export async function POST(req: NextRequest) {
  if (!limitePorIp(ipDePeticion(req), 60)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const mensajes = body?.entry?.[0]?.changes?.[0]?.value?.messages;
  if (mensajes) {
    console.log("Mensaje de WhatsApp entrante:", JSON.stringify(mensajes));
  }
  return NextResponse.json({ ok: true });
}
