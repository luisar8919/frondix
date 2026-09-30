// Correr con: npm run enviar-resumen (pensado para un cron semanal, ej. GitHub Actions o Vercel Cron).
// Requiere las mismas env vars que la app (.env) cargadas en el entorno.
import { createClient } from "@supabase/supabase-js";
import { normalizarTelefonoPE } from "../src/lib/seguimiento.ts";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GRAPH_API = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

async function enviarPlantilla(telefono, nombrePlantilla, parametros) {
  const res = await fetch(GRAPH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono,
      type: "template",
      template: {
        name: nombrePlantilla,
        language: { code: "es" },
        components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  if (!res.ok) console.error("Error enviando a", telefono, await res.text());
}

async function main() {
  const desde = new Date();
  desde.setDate(desde.getDate() - 7);

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, nombre, telefono, datasets(id), suscripciones(estado)");

  for (const empresa of empresas ?? []) {
    // El resumen semanal es parte del plan pago, igual que el resto de WhatsApp.
    if (empresa.suscripciones?.estado !== "activa") continue;
    if (!empresa.telefono) continue; // empresas creadas antes de pedir el teléfono al registrarse

    const datasetIds = (empresa.datasets ?? []).map((d) => d.id);
    if (datasetIds.length === 0) continue;

    const { count } = await supabase
      .from("records")
      .select("id", { count: "exact", head: true })
      .in("dataset_id", datasetIds)
      .gte("created_at", desde.toISOString());

    const telefono = normalizarTelefonoPE(empresa.telefono);
    if (!telefono) continue;

    // "resumen_semanal" es el nombre de una plantilla que hay que crear y aprobar
    // en Meta Business Manager antes de poder usarla (WhatsApp > Plantillas de mensaje).
    await enviarPlantilla(telefono, "resumen_semanal", [empresa.nombre, String(count ?? 0)]);
  }
}

main().then(() => console.log("Listo")).catch((e) => {
  console.error(e);
  process.exit(1);
});
