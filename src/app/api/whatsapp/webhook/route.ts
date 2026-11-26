import { NextRequest, NextResponse } from "next/server";
import { ipDePeticion, limitePorIp } from "@/lib/limiteIp";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { guardarMensajeEntrante } from "@/lib/whatsappEntrantes";

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

// Aquí llegan los mensajes entrantes -- siempre del DUEÑO de alguna empresa
// (el número compartido es solo dueño<->plataforma, ver CLAUDE.md), nunca de
// un cliente final. Se guardan en whatsapp_mensajes_entrantes (ver
// migracion-43) para que dejen de perderse en el log del servidor.
export async function POST(req: NextRequest) {
  if (!limitePorIp(ipDePeticion(req), 60)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const mensajes = body?.entry?.[0]?.changes?.[0]?.value?.messages as
    | { from?: string; type?: string; text?: { body?: string } }[]
    | undefined;

  if (mensajes?.length) {
    const admin = crearClienteAdmin();
    for (const m of mensajes) {
      if (!m.from) continue;
      const texto = m.type === "text" ? m.text?.body ?? null : `[mensaje de tipo "${m.type ?? "desconocido"}", no es texto]`;
      try {
        await guardarMensajeEntrante(admin, m.from, texto);
      } catch (e) {
        // mejor esfuerzo -- no romper el webhook (Meta reintenta si no respondemos 200)
        console.error("whatsapp/webhook: fallo al guardar un mensaje entrante:", e instanceof Error ? e.message : e);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
