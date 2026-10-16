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
    // Arranca en /dashboard, no en la portada de marketing: dashboard/layout.tsx
    // ya valida la sesión server-side y manda a /login si no hay una -- así la
    // app abre directo en login o en el panel, nunca en la landing page web.
    url: "https://www.frondix.com/dashboard",
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#faf8f3",
  },
  plugins: {
    FirebaseAuthentication: {
      // Solo queremos el idToken para pasárselo a Supabase (signInWithIdToken)
      // -- sin esto el plugin además abre una sesión de Firebase Auth propia,
      // que no usamos para nada (la sesión real es la de Supabase).
      skipNativeAuth: true,
      providers: ["google.com"],
    },
    SplashScreen: {
      // Se oculta a mano desde ShellNativo recien cuando la pagina remota
      // termino de cargar -- si no, desaparece apenas arranca la Activity,
      // mucho antes de que la WebView termine de traer frondix.com.
      launchAutoHide: false,
      backgroundColor: "#faf8f3",
    },
  },
};

export default config;
