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
    Culqi: any;
    culqi: () => void;
  }
}

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const PAYPAL_PLAN_ID_MENSUAL = process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID;
const PAYPAL_PLAN_ID_ANUAL = process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID_ANUAL;
const PADDLE_CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const PADDLE_PRICE_ID_MENSUAL = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
const PADDLE_PRICE_ID_ANUAL = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_ANUAL;
const CULQI_PUBLIC_KEY = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;

type Ciclo = "mensual" | "anual";
const PRECIO_POR_CICLO: Record<Ciclo, string> = { mensual: "S/ 50 /mes", anual: "S/ 500 /año (2 meses gratis)" };
// Centimos reales que cobra Culqi -- mismo monto que ya muestra PRECIO_POR_CICLO.
const MONTO_CENTIMOS_POR_CICLO: Record<Ciclo, number> = { mensual: 50 * 100, anual: 500 * 100 };

export default function BillingPage() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [scriptPaypalListo, setScriptPaypalListo] = useState(false);
  const [scriptPaddleListo, setScriptPaddleListo] = useState(false);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [planActivo, setPlanActivo] = useState<boolean | null>(null);
  const [pruebaHasta, setPruebaHasta] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [activandoPrueba, setActivandoPrueba] = useState(false);
  const [ciclo, setCiclo] = useState<Ciclo>("mensual");
  const [scriptCulqiListo, setScriptCulqiListo] = useState(false);
  const [cobrandoCulqi, setCobrandoCulqi] = useState(false);
  const paypalRenderizadoPara = useRef<string | null>(null);
  const planIdPaypal = ciclo === "anual" ? PAYPAL_PLAN_ID_ANUAL : PAYPAL_PLAN_ID_MENSUAL;
  const priceIdPaddle = ciclo === "anual" ? PADDLE_PRICE_ID_ANUAL : PADDLE_PRICE_ID_MENSUAL;
  // window.culqi() es una funcion global que Culqi.js llama sola al terminar
  // de tokenizar -- nunca recibe empresaId/ciclo como argumento, asi que lee
  // el valor MAS RECIENTE de un ref (si usara el estado directo, quedaria
  // pegada al valor que tenia la pagina cuando se cargo el script).
  const culqiContextoRef = useRef({ empresaId: "", montoCentimos: 0 });
  useEffect(() => {
    culqiContextoRef.current = { empresaId: empresaId ?? "", montoCentimos: MONTO_CENTIMOS_POR_CICLO[ciclo] };
  }, [empresaId, ciclo]);

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

  // Botones de PayPal: se renderizan de nuevo solo si cambió el plan (mensual <-> anual)
  // -- PayPal tira error si se renderiza 2 veces con el mismo plan en el mismo div, así
  // que el ref guarda PARA QUÉ plan ya se renderizó, no un simple "ya se hizo".
  useEffect(() => {
    if (!scriptPaypalListo || !empresaId || planActivo || !planIdPaypal || paypalRenderizadoPara.current === planIdPaypal) return;
    const contenedor = document.getElementById("paypal-buttons");
    if (contenedor) contenedor.innerHTML = "";
    paypalRenderizadoPara.current = planIdPaypal;
    window.paypal
      .Buttons({
        style: { label: "subscribe" },
        createSubscription: (_: unknown, actions: any) => actions.subscription.create({ plan_id: planIdPaypal }),
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
  }, [scriptPaypalListo, empresaId, planActivo, planIdPaypal]);

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

  async function activarPrueba() {
    if (!empresaId) return;
    setActivandoPrueba(true);
    setMensaje(null);
    const res = await fetch("/api/billing/activar-prueba", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId }),
    });
    const body = await res.json();
    setActivandoPrueba(false);
    if (!res.ok) return setMensaje(body.error ?? "No se pudo activar la prueba gratis");
    setMensaje("¡Prueba gratis activada! Ya puedes usar todos los módulos por 1 mes.");
    setPlanActivo(true);
    setPruebaHasta(body.prueba_hasta);
  }

  // Ojo: Culqi.js no avisa si el cliente cierra el formulario sin terminar
  // (no hay evento "cancelado") -- por eso cobrandoCulqi solo se prende
  // DESPUÉS de tokenizar, al mandar el token a nuestro backend, nunca antes
  // de abrir el formulario (si no, un cierre sin completar dejaría el botón
  // en "Procesando..." para siempre).
  function cobrarConCulqi() {
    if (!scriptCulqiListo || !empresaId) return;
    window.Culqi.settings({ title: "Frondix", currency: "PEN", amount: MONTO_CENTIMOS_POR_CICLO[ciclo] });
    window.Culqi.options({ lang: "auto", installments: false, paymentMethods: { tarjeta: true, yape: false, bancaMovil: false, agente: false, billetera: false, cuotealo: false } });
    window.Culqi.open();
  }

  // Definida UNA sola vez (no por click): Culqi.js llama a este nombre global
  // apenas el cliente termina de tokenizar su tarjeta en el formulario propio.
  useEffect(() => {
    window.culqi = async () => {
      if (!window.Culqi.token) {
        if (window.Culqi.error) setMensaje(window.Culqi.error.user_message ?? "No se pudo procesar la tarjeta.");
        return;
      }
      const { id: token } = window.Culqi.token;
      window.Culqi.close();
      setCobrandoCulqi(true);
      const { empresaId: idActual, montoCentimos } = culqiContextoRef.current;
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId: idActual, metodo: "tarjeta", token, montoCentimos }),
      });
      const body = await res.json().catch(() => ({}));
      setCobrandoCulqi(false);
      setMensaje(res.ok ? "Suscripción activada con Culqi." : (body.error ?? "No se pudo procesar el pago con Culqi."));
      if (res.ok) { setPlanActivo(true); setPruebaHasta(null); }
    };
  }, []);

  function cobrarConPaddle() {
    if (!scriptPaddleListo || !empresaId || !priceIdPaddle) return;
    window.Paddle.Checkout.open({
      items: [{ priceId: priceIdPaddle, quantity: 1 }],
      customData: { empresaId },
      settings: { displayMode: "overlay" },
    });
  }

  return (
    <>
      {PAYPAL_CLIENT_ID && (PAYPAL_PLAN_ID_MENSUAL || PAYPAL_PLAN_ID_ANUAL) && (
        <Script
          src={`https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`}
          onLoad={() => setScriptPaypalListo(true)}
        />
      )}
      {PADDLE_CLIENT_TOKEN && (PADDLE_PRICE_ID_MENSUAL || PADDLE_PRICE_ID_ANUAL) && (
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
      {CULQI_PUBLIC_KEY && (
        <Script
          src="https://checkout.culqi.com/js/v4"
          onLoad={() => {
            window.Culqi.publicKey = CULQI_PUBLIC_KEY;
            setScriptCulqiListo(true);
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

        {!planActivo && (
          <div style={{ display: "flex", gap: 8, margin: "4px 0 2px" }}>
            <button type="button" className={`btn ${ciclo === "mensual" ? "btn-primario" : "btn-fantasma"}`} onClick={() => setCiclo("mensual")}>
              Mensual
            </button>
            <button type="button" className={`btn ${ciclo === "anual" ? "btn-primario" : "btn-fantasma"}`} onClick={() => setCiclo("anual")}>
              Anual
            </button>
          </div>
        )}

        <div className="precio-monto" style={{ fontSize: 32 }}>{PRECIO_POR_CICLO[ciclo]}</div>
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
                ? `Estás en tu prueba gratis de 1 mes, hasta el ${new Date(pruebaHasta).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}. Después, si no activas el pago, pasas al plan gratis automáticamente.`
                : "Ya tienes este plan activo."}
            </p>
            {!confirmando ? (
              <button type="button" className="btn btn-secundario btn-bloque" onClick={() => setConfirmando(true)}>
                Cambiar a plan gratis
              </button>
            ) : (
              <div className="alerta alerta-aviso" style={{ marginBottom: 0 }}>
                <p style={{ marginTop: 0 }}>
                  Al pasarte al plan gratis dejas de pagar tu plan actual, pero también pierdes invitar a tu equipo y
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
            {pruebaHasta === null ? (
              <button type="button" className="btn btn-primario btn-grande btn-bloque" style={{ marginBottom: 10 }} onClick={activarPrueba} disabled={activandoPrueba}>
                {activandoPrueba ? "Activando..." : "Probar 1 mes gratis"}
              </button>
            ) : (
              <p className="suave pequeno" style={{ margin: "0 0 10px" }}>
                Tu mes de prueba gratis ya venció. Para seguir usando los módulos adicionales, activa el pago:
              </p>
            )}

            {PAYPAL_CLIENT_ID && planIdPaypal && (
              <div id="paypal-buttons" key={ciclo} style={{ marginBottom: 10 }} />
            )}

            {PADDLE_CLIENT_TOKEN && priceIdPaddle && (
              <button type="button" className="btn btn-secundario btn-grande btn-bloque" onClick={cobrarConPaddle} disabled={!scriptPaddleListo}>
                {scriptPaddleListo ? "Pagar con Paddle (tarjeta internacional)" : "Cargando Paddle..."}
              </button>
            )}

            {CULQI_PUBLIC_KEY && (
              <button
                type="button"
                id="btn_pagar_culqi"
                className="btn btn-secundario btn-grande btn-bloque"
                style={{ marginTop: 10 }}
                onClick={cobrarConCulqi}
                disabled={!scriptCulqiListo || cobrandoCulqi}
              >
                {!scriptCulqiListo ? "Cargando Culqi..." : cobrandoCulqi ? "Procesando..." : "Pagar con tarjeta (Culqi)"}
              </button>
            )}

            {!PAYPAL_CLIENT_ID && !PADDLE_CLIENT_TOKEN && !CULQI_PUBLIC_KEY && (
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
