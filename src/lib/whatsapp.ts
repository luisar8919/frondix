const GRAPH_API = "https://graph.facebook.com/v20.0";

// Manda un mensaje de texto libre. Solo funciona si el destinatario te escribió
// en las últimas 24hs; fuera de esa ventana hay que usar una plantilla aprobada
// por Meta (enviarPlantilla). Para el recordatorio/resumen semanal, usar plantilla.
export async function enviarTexto(telefono: string, mensaje: string) {
  return llamarGraph({
    messaging_product: "whatsapp",
    to: telefono,
    type: "text",
    text: { body: mensaje },
  });
}

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
