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
};
