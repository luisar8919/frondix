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

  // Endpoint de la v2 de Suscripciones (Culqi migró de /subscriptions a esto;
  // el viejo quedó descontinuado). Ver https://apidocs.culqi.com/#tag/Suscripciones.
  const subscription = await culqiFetch("/recurrent/subscriptions/create", {
    method: "POST",
    body: JSON.stringify({ card_id: card.id, plan_id: process.env.CULQI_PLAN_ID, tyc: true }),
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

// Cancela la suscripción en Culqi: no se le vuelve a cobrar. No borra nada
// localmente (eso lo hace quien llama, después de confirmar que esto no falló).
export async function cancelarSuscripcion(subscriptionId: string): Promise<void> {
  await culqiFetch(`/recurrent/subscriptions/${subscriptionId}`, { method: "DELETE" });
}

// El webhook de Culqi no firma sus peticiones (no hay secreto que validar), así que
// cualquiera podría mandarnos un POST fingiendo un pago exitoso. Por eso el webhook
// nunca confía en el body: usa esto para preguntarle a Culqi mismo (con nuestra llave
// secreta) si la suscripción realmente está en ese estado.
// Estados: 1=Creada 2=Periodo de prueba 3=Activa 4=Cancelada 5=En cola 6=Vencida
export async function estadoSuscripcion(subscriptionId: string): Promise<number> {
  const sub = await culqiFetch(`/recurrent/subscriptions/${subscriptionId}`);
  return sub.status;
}
