import type { SupabaseClient } from "@supabase/supabase-js";

// Cada WhatsApp real (plantilla aprobada, Cloud API) tiene costo según la
// tarifa de Meta -- a diferencia de push/correo/Telegram, que son gratis. Un
// registro por envío exitoso (ver migracion-42), para que /dashboard/notificaciones
// pueda mostrar cuántos van este mes y la cuenta no sea una sorpresa en la
// factura. "Mejor esfuerzo": si esto falla, nunca debe tirar abajo el envío
// real que ya se mandó -- quien llama debe envolverlo en try/catch aparte.
export async function registrarEnvioWhatsapp(supabaseAdmin: SupabaseClient, empresaId: string): Promise<void> {
  await supabaseAdmin.from("whatsapp_envios").insert({ empresa_id: empresaId });
}

// Cuántos WhatsApp reales se mandaron este mes calendario (hora UTC, alcanza
// para un contador informativo -- no es para facturar nada a terceros).
export async function enviosWhatsappEsteMes(supabase: SupabaseClient, empresaId: string): Promise<number> {
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("whatsapp_envios")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .gte("enviado_en", inicioMes.toISOString());
  return count ?? 0;
}
