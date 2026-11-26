import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTelefonoPE } from "./seguimiento.ts";

// El webhook de WhatsApp (api/whatsapp/webhook) no sabe de qué empresa es un
// mensaje entrante -- el único número de WhatsApp es compartido por toda la
// plataforma (ver CLAUDE.md), así que hay que resolverlo comparando el
// teléfono remitente contra el "WhatsApp del negocio" de cada empresa. Quien
// escribe acá es el DUEÑO de esa empresa (WhatsApp es solo dueño<->plataforma,
// nunca cliente final), así que esto es básicamente "¿qué empresa me escribió?".
export async function guardarMensajeEntrante(
  supabaseAdmin: SupabaseClient,
  telefonoRemitente: string,
  mensaje: string | null
): Promise<void> {
  const normalizado = normalizarTelefonoPE(telefonoRemitente);
  let empresaId: string | null = null;

  if (normalizado) {
    // Mejor esfuerzo: si esto no encuentra nada (o la query falla), igual se
    // guarda el mensaje con empresa_id null -- no perder el dato por no poder
    // atribuirlo es mejor que perderlo del todo.
    const { data: empresas } = await supabaseAdmin.from("empresas").select("id, telefono").not("telefono", "is", null);
    const match = (empresas ?? []).find((e) => normalizarTelefonoPE(e.telefono) === normalizado);
    empresaId = match?.id ?? null;
  }

  await supabaseAdmin.from("whatsapp_mensajes_entrantes").insert({
    empresa_id: empresaId,
    telefono: telefonoRemitente,
    mensaje: mensaje?.slice(0, 2000) ?? null,
  });
}
