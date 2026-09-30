"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";

declare global {
  interface Window {
    Culqi: any;
    culqi: () => void;
  }
}

export default function BillingPage() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [scriptListo, setScriptListo] = useState(false);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [planActivo, setPlanActivo] = useState<boolean | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function cargarEstado() {
    const supabase = crearClienteBrowser();
    const sesion = await empresaDelUsuario(supabase);
    if (!sesion.ok) return;
    setEmpresaId(sesion.empresaId);
    const { data } = await supabase.from("suscripciones").select("estado").eq("empresa_id", sesion.empresaId).single();
    setPlanActivo(data?.estado === "activa");
  }

  useEffect(() => {
    cargarEstado();
  }, []);

  async function bajarAGratis() {
    if (!empresaId) return;
    setCancelando(true);
    setMensaje(null);
    const res = await fetch("/api/billing/cancelar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId }),
    });
    const body = await res.json();
    setCancelando(false);
    setConfirmando(false);
    if (!res.ok) return setMensaje(body.error ?? "No se pudo cambiar el plan");
    setMensaje("Listo, ya estás en el plan gratis. No se te vuelve a cobrar.");
    setPlanActivo(false);
  }

  async function cobrar() {
    if (!scriptListo) return;

    window.culqi = async function () {
      if (!window.Culqi.token) {
        setMensaje(window.Culqi.error?.user_message ?? "No se pudo validar la tarjeta");
        return;
      }
      const supabase = crearClienteBrowser();
      const sesion = await empresaDelUsuario(supabase);
      if (!sesion.ok) return setMensaje(sesion.error);

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId: sesion.empresaId,
          metodo: "tarjeta",
          token: window.Culqi.token.id,
        }),
      });
      const body = await res.json();
      setMensaje(res.ok ? "Suscripción activada." : body.error);
      if (res.ok) setPlanActivo(true);
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
          <li>Todos los módulos y registros que necesites</li>
          <li>Seguimiento de clientes por WhatsApp (mensaje listo, lo envías con un toque) <span className="insignia insignia-sol">Envío automático: próximamente</span></li>
          <li>Sugerencia por IA para ordenar Excels muy desordenados al crear módulos</li>
        </ul>

        {planActivo ? (
          <>
            <p className="suave pequeno" style={{ margin: "0 0 10px" }}>Ya tienes este plan activo.</p>
            {!confirmando ? (
              <button type="button" className="btn btn-secundario btn-bloque" onClick={() => setConfirmando(true)}>
                Cambiar a plan gratis
              </button>
            ) : (
              <div className="alerta alerta-aviso" style={{ marginBottom: 0 }}>
                <p style={{ marginTop: 0 }}>
                  Al pasarte al plan gratis dejas de pagar S/ 35/mes, pero también pierdes invitar a tu equipo y
                  el seguimiento por WhatsApp. Tus datos no se borran, se quedan tal como están.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="btn btn-primario" onClick={bajarAGratis} disabled={cancelando}>
                    {cancelando ? "Cambiando..." : "Sí, pasarme al plan gratis"}
                  </button>
                  <button type="button" className="btn btn-fantasma" onClick={() => setConfirmando(false)} disabled={cancelando}>
                    Mejor no
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <button type="button" className="btn btn-primario btn-grande btn-bloque" onClick={cobrar} disabled={!scriptListo}>
            {scriptListo ? "Pagar con tarjeta" : "Cargando pagos..."}
          </button>
        )}

        {mensaje && (
          <p className={`alerta ${mensaje.startsWith("Suscripción") || mensaje.startsWith("Listo") ? "alerta-ok" : "alerta-error"}`} role="status" style={{ marginTop: 14, marginBottom: 0 }}>
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
