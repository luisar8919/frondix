import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, logEvent, type Analytics } from "firebase/analytics";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ponytail: sin measurementId todavía (no hay cuenta de Google Analytics
// vinculada al proyecto) -- getAnalytics funciona igual, pero los eventos no
// van a aparecer en ningún reporte de GA hasta que se vincule una cuenta
// desde Firebase Console (2 clics, requiere elegir/crear la cuenta de GA a
// mano, no se puede automatizar sin arriesgar vincular la cuenta equivocada).
let analytics: Analytics | null = null;

function app() {
  return getApps().length ? getApp() : initializeApp(config);
}

// Solo en browser -- Analytics no corre en el servidor/SSR.
export function trackEvent(nombre: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !config.apiKey) return;
  try {
    analytics ??= getAnalytics(app());
    logEvent(analytics, nombre, params);
  } catch (e) {
    console.error("firebase-client: fallo logEvent", nombre, e instanceof Error ? e.message : e);
  }
}
