const CULQI_API = "https://api.culqi.com/v2";

async function culqiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${CULQI_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CULQI_SECRET_KEY}`,
      ...options.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.user_message || body?.merchant_message || "Error de Culqi");
  return body;
}

// Tarjeta: suscripción automática real. El token viene del widget Culqi.js
// del lado del cliente (nunca mandes el número de tarjeta a tu propio backend).
export async function crearSuscripcionConTarjeta(email: string, tokenTarjeta: string) {
  const customer = await culqiFetch("/customers", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  const card = await culqiFetch("/cards", {
    method: "POST",
    body: JSON.stringify({ customer_id: customer.id, token_id: tokenTarjeta }),
  });

  const subscription = await culqiFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify({ card_id: card.id, plan_id: process.env.CULQI_PLAN_ID }),
  });

  return { customerId: customer.id, cardId: card.id, subscriptionId: subscription.id };
}

// Yape: cargo único (Culqi no soporta recurrencia automática con Yape todavía).
// Se genera un cobro por mes; el cliente debe aprobarlo en su app cada vez.
export async function crearCargoYape(email: string, tokenYape: string, montoCentimos: number) {
  return culqiFetch("/charges", {
    method: "POST",
    body: JSON.stringify({
      amount: montoCentimos,
      currency_code: "PEN",
      email,
      source_id: tokenYape,
    }),
  });
}
