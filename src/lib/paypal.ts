// Suscripciones internacionales via PayPal. El plan mensual (precio, moneda) se
// crea una vez en PayPal (dashboard o API) y su id va en PAYPAL_PLAN_ID -- mismo
// patrón que CULQI_PLAN_ID en culqi.ts.
const PAYPAL_API = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

let tokenCache: { token: string; vence: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.vence > Date.now()) return tokenCache.token;
  const credenciales = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credenciales}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error_description || "No se pudo autenticar con PayPal");
  tokenCache = { token: body.access_token, vence: Date.now() + (body.expires_in - 60) * 1000 };
  return tokenCache.token;
}

async function paypalFetch(path: string, options: RequestInit = {}) {
  const token = await accessToken();
  const res = await fetch(`${PAYPAL_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || "Error de PayPal");
  return body;
}

// El dueño aprueba la suscripción en el botón de PayPal (SDK del lado del cliente) y
// nos manda el subscriptionID -- esto confirma contra la API de PayPal que de verdad
// quedó activa antes de guardarla. Nunca se confía en lo que manda el navegador, solo
// en la respuesta verificada del proveedor (mismo criterio que culqi.ts).
export async function estadoSuscripcionPaypal(subscriptionId: string): Promise<{ activa: boolean; estado: string }> {
  const sub = await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}`);
  return { activa: sub.status === "ACTIVE", estado: sub.status };
}

export async function cancelarSuscripcionPaypal(subscriptionId: string): Promise<void> {
  await paypalFetch(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: "Cambio a plan gratis" }),
  });
}
