import { createHmac, timingSafeEqual } from "node:crypto";

const PADDLE_API = process.env.PADDLE_ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

// Paddle firma cada webhook con el secreto del endpoint (su dashboard > Developer
// Tools > Notifications): header "Paddle-Signature" = "ts=...;h1=<hmac>" calculado
// sobre ts + ":" + el cuerpo CRUDO (sin parsear) -- si no coincide, es una petición
// falsa y se descarta sin confiar en nada de lo que diga.
export function verificarFirmaPaddle(firma: string | null, cuerpoCrudo: string): boolean {
  if (!firma || !process.env.PADDLE_WEBHOOK_SECRET) return false;
  const partes = Object.fromEntries(firma.split(";").map((p) => p.split("=") as [string, string]));
  if (!partes.ts || !partes.h1) return false;
  const esperado = createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET).update(`${partes.ts}:${cuerpoCrudo}`).digest("hex");
  const a = Buffer.from(partes.h1);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function cancelarSuscripcionPaddle(subscriptionId: string): Promise<void> {
  const res = await fetch(`${PADDLE_API}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ effective_from: "immediately" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.detail || "No se pudo cancelar en Paddle");
  }
}
