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
    <>
      <Script src="https://checkout.culqi.com/js/v4" onLoad={() => setScriptListo(true)} />
      <div className="panel-cabecera">
        <div>
          <h1>Plan y pagos</h1>
          <p className="suave">Un solo plan, sin contrato.</p>
        </div>
      </div>

      <div className="tarjeta tarjeta-elevada precio precio-destacado" style={{ maxWidth: 460 }}>
        <h3>Plan Completo</h3>
        <div className="precio-monto">S/ 35<small> /mes</small></div>
        <ul>
          <li>Invita a tu equipo con accesos por rol</li>
          <li>Todas las tablas y registros que necesites</li>
          <li>Avisos y recordatorios por WhatsApp <span className="insignia insignia-sol">Próximamente</span></li>
        </ul>
        <button type="button" className="btn btn-primario btn-grande btn-bloque" onClick={cobrar} disabled={!scriptListo}>
          {scriptListo ? "Pagar con tarjeta" : "Cargando pagos..."}
        </button>
        {mensaje && (
          <p className={`alerta ${mensaje.startsWith("Suscripción") ? "alerta-ok" : "alerta-error"}`} role="status" style={{ marginTop: 14, marginBottom: 0 }}>
            {mensaje}
          </p>
        )}
      </div>

      <p className="suave pequeno" style={{ maxWidth: 460, marginTop: 16 }}>
        ¿Prefieres pagar con Yape? Escríbenos y te mandamos el enlace de cobro manual. Con Yape el cobro
        no es automático todos los meses: hay que aprobarlo cada vez.
      </p>
    </>
  );
}
