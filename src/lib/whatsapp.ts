const GRAPH_API = "https://graph.facebook.com/v20.0";

// Plantilla aprobada por Meta -- el único envío real que queda (notifica al
// DUEÑO de la empresa, nunca a su cliente final, ver cron de seguimiento).
// Un texto libre (enviarTexto) exigiría que el destinatario te haya escrito
// primero en las últimas 24hs, y ya no hay ningún caso de uso para eso acá.
export async function enviarPlantilla(
  telefono: string,
  nombrePlantilla: string,
  parametros: string[] = []
) {
  return llamarGraph({
    messaging_product: "whatsapp",
    to: telefono,
    type: "template",
    template: {
      name: nombrePlantilla,
      language: { code: "es" },
      components: parametros.length
        ? [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }]
        : undefined,
    },
  });
}

async function llamarGraph(body: unknown) {
  const res = await fetch(`${GRAPH_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Error de WhatsApp API");
  return data;
}
