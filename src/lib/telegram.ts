const TELEGRAM_API = "https://api.telegram.org";

// Manda un mensaje a un chat ya vinculado (empresas.telegram_chat_id). A
// diferencia de WhatsApp, Telegram no tiene ventana de 24hs ni plantillas
// aprobadas -- cualquier bot puede escribirle a un chat que ya le haya
// hablado antes (por eso el flujo de vinculación pide que el dueño le
// mande /start al bot primero, ver /api/telegram/webhook).
export async function enviarTelegram(chatId: string, mensaje: string) {
  const res = await fetch(`${TELEGRAM_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: mensaje }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data?.description ?? "Error de Telegram");
  return data;
}
