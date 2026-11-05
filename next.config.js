/** @type {import('next').NextConfig} */
module.exports = {
  // frondix.com y www.frondix.com servían la misma app sin que uno redirija al
  // otro -- eso rompía el login con Google: la cookie del PKCE code_verifier se
  // escribe en el dominio donde se inicia el flujo, pero si el regreso de Google
  // aterriza en el OTRO dominio (ej. por un link viejo, un bookmark, o la
  // configuración de Supabase), esa cookie no está ahí y falla con "PKCE code
  // verifier not found in storage". `redirects()` de Next.js corre en el propio
  // router de Next (no es middleware.ts, que Azure Static Web Apps sí no
  // soporta), así que esto funciona en el hosting actual.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "frondix.com" }],
        destination: "https://www.frondix.com/:path*",
        permanent: true,
      },
    ];
  },
  // Headers de seguridad basicos (encontrados ausentes en una auditoria,
  // 2026-10-29). CSP (auditoria ISO 27001, 2026-11-03): dominios inventariados
  // a mano (grep de URLs en src/) para PayPal/Paddle (unicos scripts externos,
  // /dashboard/billing) y Supabase (*.supabase.co, API + auth, sin Realtime --
  // no se usa .channel()/websockets en el proyecto). 'unsafe-inline' en
  // script-src/style-src es necesario porque Next.js en este hosting (Azure
  // Static Web Apps, sin middleware.ts) no puede inyectar un nonce por
  // request -- igual bloquea cargar JS/CSS de un dominio externo no listado,
  // que es el vector real (inyectar un <script src="evil.com">). Arranca
  // como "Report-Only" (SOLO reporta en la consola del navegador, no bloquea
  // nada) a proposito: probar el checkout real de PayPal y Paddle en vivo,
  // revisar la consola por violaciones, y recien ahi renombrar el header de
  // abajo a "Content-Security-Policy" (sin "-Report-Only") para que bloquee.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.paypalobjects.com https://cdn.paddle.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://www.paypalobjects.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co https://api-m.paypal.com https://api-m.sandbox.paypal.com https://www.paypal.com https://www.sandbox.paypal.com https://api.paddle.com https://sandbox-api.paddle.com",
      "frame-src 'self' https://www.paypal.com https://www.sandbox.paypal.com https://*.paddle.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};
