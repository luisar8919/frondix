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
  // 2026-10-29). CSP queda afuera a proposito: /dashboard/billing carga
  // scripts externos de PayPal y Paddle (next/script), y una CSP mal armada
  // sin probar en vivo primero podria romper el checkout en produccion.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
