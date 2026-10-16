"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// Monta en el layout del panel (solo hace algo dentro de la app nativa): pide
// permiso de notificaciones, se registra en Firebase y manda el token al
// servidor para que el cron de seguimiento pueda avisar por esta vía.
export default function RegistrarPush() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    PushNotifications.addListener("registration", (token) => {
      fetch("/api/push/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.value }),
      }).catch(() => { /* se reintenta en el próximo login */ });
    });

    PushNotifications.checkPermissions().then((estado) => {
      if (estado.receive === "granted") return PushNotifications.register();
      if (estado.receive !== "denied") {
        return PushNotifications.requestPermissions().then((r) => {
          if (r.receive === "granted") PushNotifications.register();
        });
      }
    });

    return () => { PushNotifications.removeAllListeners(); };
  }, []);

  return null;
}
