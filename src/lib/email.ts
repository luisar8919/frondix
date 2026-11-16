import type { SupabaseClient } from "@supabase/supabase-js";

// Envío de correos transaccionales (Resend, resend.com). Las credenciales
// NUNCA van al repo -- viven solo en RESEND_API_KEY/RESEND_FROM_EMAIL
// (.env.local en desarrollo, variables de entorno de Azure en producción).
// No usamos el envío de email de Supabase Auth porque sus plantillas son
// fijas para flujos de autenticación (invitación, recuperar clave) -- esto
// es para avisos de negocio con asunto/cuerpo libres.
export async function enviarCorreo(
  supabaseAdmin: SupabaseClient,
  userIds: string[],
  asunto: string,
  cuerpoHtml: string
): Promise<void> {
  if (userIds.length === 0) return;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // sin configurar -- mejor esfuerzo, no rompe el cron

  const from = process.env.RESEND_FROM_EMAIL || "Frondix <avisos@frondix.com>";

  for (const userId of userIds) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = data?.user?.email;
      if (!email) continue;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email, subject: asunto, html: cuerpoHtml }),
      });
      if (!res.ok) {
        console.error(`email: fallo enviando a ${email}:`, await res.text());
      }
    } catch (e) {
      // cualquier otro error (usuario no encontrado, red, etc.): no bloquea el resto de los envíos
      console.error(`email: fallo con el usuario ${userId}:`, e instanceof Error ? e.message : e);
    }
  }
}
