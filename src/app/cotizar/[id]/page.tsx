"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";

interface Cotizacion {
  cliente: string;
  producto: string;
  monto: number;
  fecha: string;
  estado: "pendiente" | "aceptada" | "rechazada";
}

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

// Página pública (sin sesión) para que el cliente acepte o rechace una
// cotización desde el link que le llega por WhatsApp -- ver enlaceWhatsApp en
// Cotizaciones.tsx y /api/cotizaciones/publica/[id] (el token en la URL hace
// de llave de un solo uso para esta fila).
export default function CotizacionPublica({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const token = useSearchParams().get("token") ?? "";
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  function cargar() {
    fetch(`/api/cotizaciones/publica/${id}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar la cotización");
        setCot(body.cotizacion);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }
  useEffect(cargar, [id, token]);

  async function responder(estado: "aceptada" | "rechazada") {
    setEnviando(true);
    setError("");
    const res = await fetch(`/api/cotizaciones/publica/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, estado }),
    });
    setEnviando(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "No se pudo responder la cotización");
    cargar();
  }

  return (
    <div className="contenedor" style={{ maxWidth: 480, margin: "0 auto", padding: "40px 16px" }}>
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!cot && !error && <p className="suave">Cargando...</p>}

      {cot && (
        <div className="tarjeta" style={{ padding: 24 }}>
          <h1 style={{ marginTop: 0 }}>Cotización para {cot.cliente}</h1>
          <p style={{ fontSize: 18 }}>{cot.producto}</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 20px" }}>{soles(cot.monto)}</p>

          {cot.estado === "pendiente" && (
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primario btn-grande" style={{ flex: 1 }} disabled={enviando} onClick={() => responder("aceptada")}>
                Aceptar
              </button>
              <button className="btn btn-grande" style={{ flex: 1 }} disabled={enviando} onClick={() => responder("rechazada")}>
                Rechazar
              </button>
            </div>
          )}
          {cot.estado === "aceptada" && <p className="alerta alerta-ok">Ya aceptaste esta cotización. ¡Gracias!</p>}
          {cot.estado === "rechazada" && <p className="alerta alerta-error">Rechazaste esta cotización.</p>}
        </div>
      )}
    </div>
  );
}
