"use client";

import Script from "next/script";
import { useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";

declare global {
  interface Window {
    Culqi: any;
    culqi: () => void;
  }
}

export default function BillingPage() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [scriptListo, setScriptListo] = useState(false);

  async function cobrar() {
    if (!scriptListo) return;

    window.culqi = async function () {
      if (!window.Culqi.token) {
        setMensaje(window.Culqi.error?.user_message ?? "No se pudo validar la tarjeta");
        return;
      }
      const supabase = crearClienteBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: miembro } = await supabase
        .from("miembros")
        .select("empresa_id")
        .eq("user_id", user!.id)
        .single();

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId: miembro!.empresa_id,
          metodo: "tarjeta",
          token: window.Culqi.token.id,
        }),
      });
      const body = await res.json();
      setMensaje(res.ok ? "Suscripción activada." : body.error);
    };

    window.Culqi.publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
    window.Culqi.settings({ title: "Frondix", currency: "PEN", amount: 3500 });
    window.Culqi.open();
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto" }}>
      <Script src="https://checkout.culqi.com/js/v4" onLoad={() => setScriptListo(true)} />
      <h1>Facturación</h1>
      <p>Plan único: S/ 35/mes.</p>
      <button onClick={cobrar} disabled={!scriptListo}>Pagar con tarjeta</button>
      {mensaje && <p>{mensaje}</p>}
      <p style={{ fontSize: 13, color: "#666", marginTop: 24 }}>
        ¿Preferís pagar con Yape? Escribinos y te mandamos el link de cobro manual
        (con Yape, Culqi todavía no soporta cobro recurrente automático).
      </p>
    </main>
  );
}
