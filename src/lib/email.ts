import type { SupabaseClient } from "@supabase/supabase-js";

// Envío de correos transaccionales (Resend, resend.com). Las credenciales
// NUNCA van al repo -- viven solo en RESEND_API_KEY/RESEND_FROM_EMAIL
// (.env.local en desarrollo, variables de entorno de Azure en producción).
// No usamos el envío de email de Supabase Auth porque sus plantillas son
// fijas para flujos de autenticación (invitación, recuperar clave) -- esto
// es para avisos de negocio con asunto/cuerpo libres.
// Envuelve el contenido propio de cada aviso en un layout mínimo con
// encabezado/firma de marca y un botón de acción -- un cuerpo más completo
// (con versión de texto plano, ver abajo) ayuda a no caer en spam en el
// primer envío de un dominio todavía sin historial de entrega.
function plantillaCorreo(cuerpoInterno: string): string {
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <div style="padding: 20px 0; border-bottom: 2px solid #1f6f45;">
        <strong style="font-size: 18px; color: #1f6f45;">Frondix</strong>
      </div>
      <div style="padding: 20px 0; font-size: 15px; line-height: 1.5;">
        ${cuerpoInterno}
        <p style="margin-top: 24px;">
          <a href="https://www.frondix.com/dashboard" style="background: #1f6f45; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Abrir Frondix</a>
        </p>
      </div>
      <div style="padding: 16px 0; border-top: 1px solid #ddd; font-size: 12px; color: #888;">
        Recibes esto porque administras un negocio en Frondix. Este aviso se genera automáticamente desde tus propios datos.
      </div>
    </div>`;
}

function textoPlano(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Sobre separado para correos AL CLIENTE del negocio (no al dueño): sin el
// botón "Abrir Frondix" (no tiene cuenta ni sentido para él), con el nombre
// del negocio como remitente visible y un pie chico de transparencia. El
// "from" sigue siendo el dominio ya verificado de Frondix (frondix.com) --
// un dominio propio por empresa requeriría que cada negocio edite el DNS de
// SU dominio, fricción real para dueños no técnicos y sin ningún pedido
// concreto todavía; si hace falta más adelante, se agrega como opción
// avanzada sin tocar este camino por defecto.
function plantillaCorreoCliente(nombreEmpresa: string, cuerpoInterno: string): string {
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <div style="padding: 20px 0; border-bottom: 2px solid #1f6f45;">
        <strong style="font-size: 18px;">${nombreEmpresa}</strong>
      </div>
      <div style="padding: 20px 0; font-size: 15px; line-height: 1.5;">
        ${cuerpoInterno}
      </div>
      <div style="padding: 16px 0; border-top: 1px solid #ddd; font-size: 12px; color: #888;">
        Mensaje enviado por ${nombreEmpresa} a través de Frondix.
      </div>
    </div>`;
}

// Correo directo a UN destinatario externo (el cliente del negocio, no un
// usuario de Frondix) -- a diferencia de enviarCorreo(), que busca el email
// vía Supabase Auth, acá el destinatario ya viene como string (el valor de
// la columna rol "correo" de ese registro).
export async function enviarCorreoAlCliente(
  destinatario: string,
  nombreEmpresa: string,
  mensaje: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // sin configurar -- mejor esfuerzo, no rompe la regla
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) return; // dato sucio, no se intenta mandar

  const from = process.env.RESEND_FROM_EMAIL || "Frondix <avisos@frondix.com>";
  const html = plantillaCorreoCliente(nombreEmpresa, `<p>${mensaje}</p>`);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: destinatario, subject: `Mensaje de ${nombreEmpresa}`, html, text: textoPlano(html) }),
    });
    if (!res.ok) console.error(`email: fallo enviando a cliente ${destinatario}:`, await res.text());
  } catch (e) {
    console.error(`email: fallo con el cliente ${destinatario}:`, e instanceof Error ? e.message : e);
  }
}

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
  const html = plantillaCorreo(cuerpoHtml);

  for (const userId of userIds) {
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = data?.user?.email;
      if (!email) continue;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email, subject: asunto, html, text: textoPlano(html) }),
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
