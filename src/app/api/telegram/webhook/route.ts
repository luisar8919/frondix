import { NextRequest, NextResponse } from "next/server";
import { ipDePeticion, limitePorIp } from "@/lib/limiteIp";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Telegram llama a esto por cada mensaje que le mandan al bot. Lo único que
// nos importa: "/start <empresaId>", el deep-link que arma la pantalla de
// Mi Empresa (t.me/<bot>?start=<empresaId>) -- eso vincula el chat_id real
// del dueño del negocio a su empresa, sin que nunca tengamos que pedirle
// su usuario de Telegram a mano.
export async function POST(req: NextRequest) {
  if (!limitePorIp(ipDePeticion(req), 60)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  // Telegram manda este header con el secret_token configurado en setWebhook,
  // si ya lo configuramos -- evita que cualquiera nos mande updates falsos.
  const secreto = req.headers.get("x-telegram-bot-api-secret-token");
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secreto !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Token inválido" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const texto: string | undefined = body?.message?.text;
  const chatId = body?.message?.chat?.id;

  if (texto?.startsWith("/start ") && chatId) {
    const empresaId = texto.slice("/start ".length).trim();
    const admin = crearClienteAdmin();
    const { data: empresa } = await admin.from("empresas").select("id").eq("id", empresaId).single();
    if (empresa) {
      await admin.from("empresas").update({ telegram_chat_id: String(chatId) }).eq("id", empresaId);
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "Listo, tu negocio ya está conectado. Acá te vamos a avisar de clientes inactivos y otras alertas de Frondix." }),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
