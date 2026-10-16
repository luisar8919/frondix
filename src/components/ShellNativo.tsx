"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App } from "@capacitor/app";

// Solo hace algo dentro de la app nativa (Capacitor.isNativePlatform()):
// - Mantiene el splash nativo puesto hasta que la pagina remota termino de
//   cargar (sin esto se ve un blanco entre el splash y que cargue
//   https://www.frondix.com, porque la WebView apunta a server.url, no a un
//   HTML empaquetado). launchAutoHide:false en capacitor.config.ts es el otro
//   lado de este mismo arreglo.
// - Pinta la barra de estado del color de marca.
// - Boton atras fisico: retrocede en el historial de la WebView: si no hay
//   historial, pide un segundo toque para salir (patron nativo estandar) en
//   vez de cerrar la app de un solo toque.
export default function ShellNativo() {
  const ultimoAtras = useRef(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    StatusBar.setBackgroundColor({ color: "#0f3d2a" }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});

    const ocultarSplash = () => SplashScreen.hide().catch(() => {});
    if (document.readyState === "complete") ocultarSplash();
    else window.addEventListener("load", ocultarSplash, { once: true });

    const listener = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
        return;
      }
      const ahora = Date.now();
      if (ahora - ultimoAtras.current < 2000) {
        App.exitApp();
        return;
      }
      ultimoAtras.current = ahora;
      // ponytail: toast nativo via alert seria intrusivo; sin feedback visual
      // por ahora. Subir a un toast real (p.ej. @capacitor/toast) si se nota falta.
    });

    return () => {
      window.removeEventListener("load", ocultarSplash);
      listener.then((l) => l.remove());
    };
  }, []);

  return null;
}
