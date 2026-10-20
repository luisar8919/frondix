"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

declare global {
  interface Window {
    paypal: any;
    Paddle: any;
  }
}

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const PAYPAL_PLAN_ID = process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID;
const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const PADDLE_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;

export default function BillingPage() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [scriptPaypalListo, setScriptPaypalListo] = useState(false);
  const [scriptPaddleListo, setScriptPaddleListo] = useState(false);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [planActivo, setPlanActivo] = useState<boolean | null>(null);
  const [pruebaHasta, setPruebaHasta] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const paypalRenderizado = useRef(false);

  async function cargarEstado() {
    const supabase = crearClienteBrowser();
    const sesion = await empresaDelUsuario(supabase);
    if (!sesion.ok) return;
    setEmpresaId(sesion.empresaId);
    setPlanActivo(await tieneSuscripcionActiva(supabase, sesion.empresaId));
    const { data } = await supabase.from("suscripciones").select("prueba_hasta").eq("empresa_id", sesion.empresaId).single();
    setPruebaHasta(data?.prueba_hasta ?? null);
  }

  useEffect(() => {
    cargarEstado();
  }, []);

  // Botones de PayPal: se renderizan una sola vez, cuando el SDK ya cargó y ya
  // sabemos a qué empresa facturar (si se renderizan de nuevo con el mismo div, PayPal tira error).
  useEffect(() => {
    if (!scriptPaypalListo || !empresaId || planActivo || paypalRenderizado.current || !PAYPAL_PLAN_ID) return;
    paypalRenderizado.current = true;
    window.paypal
      .Buttons({
        style: { label: "subscribe" },
        createSubscription: (_: unknown, actions: any) => actions.subscription.create({ plan_id: PAYPAL_PLAN_ID }),
        onApprove: async (data: { subscriptionID: string }) => {
          const res = await fetch("/api/billing/paypal/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ empresaId, subscriptionId: data.subscriptionID }),
          });
          const body = await res.json();
          setMensaje(res.ok ? "Suscripción activada con PayPal." : body.error);
          if (res.ok) { setPlanActivo(true); setPruebaHasta(null); }
        },
        onError: () => setMensaje("No se pudo procesar el pago con PayPal."),
      })
      .render("#paypal-buttons");
  }, [scriptPaypalListo, empresaId, planActivo]);

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

  function cobrarConPaddle() {
    if (!scriptPaddleListo || !empresaId || !PADDLE_PRICE_ID) return;
    window.Paddle.Checkout.open({
      items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
      customData: { empresaId },
      settings: { displayMode: "overlay" },
    });
  }

  return (
    <>
      {PAYPAL_CLIENT_ID && PAYPAL_PLAN_ID && (
        <Script
          src={`https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`}
          onLoad={() => setScriptPaypalListo(true)}
        />
      )}
      {PADDLE_CLIENT_TOKEN && PADDLE_PRICE_ID && (
        <Script
          src="https://cdn.paddle.com/paddle/v2/paddle.js"
          onLoad={() => {
            if (process.env.NEXT_PUBLIC_PADDLE_ENV !== "live") window.Paddle.Environment.set("sandbox");
            // Paddle no confirma el pago con un callback síncrono: avisa de verdad
            // por el webhook (ver /api/billing/paddle/webhook). "checkout.completed"
            // acá solo dispara un refresco optimista para no dejar la pantalla vieja
            // mientras el webhook todavía no llegó.
            window.Paddle.Initialize({
              token: PADDLE_CLIENT_TOKEN,
              eventCallback: (e: { name: string }) => {
                if (e.name === "checkout.completed") setTimeout(cargarEstado, 2000);
              },
            });
            setScriptPaddleListo(true);
          }}
        />
      )}

      <div className="panel-cabecera">
        <div>
          <h1>Plan y pagos</h1>
          <p className="suave">Un solo plan, sin contrato.</p>
        </div>
      </div>

      <div className="tarjeta tarjeta-elevada precio precio-destacado" style={{ maxWidth: 460 }}>
        <h3>Plan Completo</h3>
        <div className="precio-monto">$ 9.99<small> /mes</small></div>
        <ul>
          <li>Invita a tu equipo con accesos por rol</li>
          <li>Todos los módulos y registros que necesites</li>
          <li>Seguimiento de clientes por WhatsApp (mensaje listo, lo envías con un toque) <span className="insignia insignia-sol">Envío automático: próximamente</span></li>
          <li>Sugerencia por IA para ordenar Excels muy desordenados al crear módulos</li>
        </ul>

        {planActivo ? (
          <>
            <p className="suave pequeno" style={{ margin: "0 0 10px" }}>
              {pruebaHasta
                ? `Estás en tu prueba gratis de 3 meses, hasta el ${new Date(pruebaHasta).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}. Después, si no activas el pago, pasas al plan gratis automáticamente.`
                : "Ya tienes este plan activo."}
            </p>
            {!confirmando ? (
              <button type="button" className="btn btn-secundario btn-bloque" onClick={() => setConfirmando(true)}>
                Cambiar a plan gratis
              </button>
            ) : (
              <div className="alerta alerta-aviso" style={{ marginBottom: 0 }}>
                <p style={{ marginTop: 0 }}>
                  Al pasarte al plan gratis dejas de pagar $ 9.99/mes, pero también pierdes invitar a tu equipo y
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
          <>
            {PAYPAL_CLIENT_ID && PAYPAL_PLAN_ID && (
              <div id="paypal-buttons" style={{ marginBottom: 10 }} />
            )}

            {PADDLE_CLIENT_TOKEN && PADDLE_PRICE_ID && (
              <button type="button" className="btn btn-secundario btn-grande btn-bloque" onClick={cobrarConPaddle} disabled={!scriptPaddleListo}>
                {scriptPaddleListo ? "Pagar con Paddle (tarjeta internacional)" : "Cargando Paddle..."}
              </button>
            )}

            {!PAYPAL_CLIENT_ID && !PADDLE_CLIENT_TOKEN && (
              <p className="alerta alerta-aviso" style={{ marginBottom: 0 }}>Falta configurar una pasarela de pago.</p>
            )}
          </>
        )}

        {mensaje && (
          <p className={`alerta ${mensaje.startsWith("Suscripción") || mensaje.startsWith("Listo") ? "alerta-ok" : "alerta-error"}`} role="status" style={{ marginTop: 14, marginBottom: 0 }}>
            {mensaje}
          </p>
        )}
      </div>
    </>
  );
}
