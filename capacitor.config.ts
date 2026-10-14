import type { CapacitorConfig } from "@capacitor/cli";

// Frondix ya es un sitio con sesión server-side (cookies de Supabase, rutas
// dinámicas) -- no tiene sentido "empaquetar" el HTML localmente como una SPA
// estática. Este shell de Capacitor es un WebView que carga directo el sitio
// en vivo (server.url): cualquier cambio al código web se refleja en la app
// sin volver a publicar un APK. `webDir` sigue siendo obligatorio para el
// pipeline de Capacitor, pero solo contiene una pantalla de respaldo (ver
// mobile-web/index.html) que se ve una fracción de segundo si no hay
// internet, antes de que la WebView navegue a server.url.
const config: CapacitorConfig = {
  appId: "com.frondix.app",
  appName: "Frondix",
  webDir: "mobile-web",
  server: {
    url: "https://www.frondix.com",
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#faf8f3",
  },
};

export default config;
