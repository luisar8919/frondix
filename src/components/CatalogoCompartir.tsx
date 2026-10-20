"use client";

import { useEffect, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";

// Prender/apagar el catálogo público de productos y compartir el link por
// WhatsApp. Apagado por defecto (ver migración 23) -- nadie ve precios/stock
// hasta que el dueño lo active acá.
export default function CatalogoCompartir() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [activo, setActivo] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = crearClienteBrowser();
      const sesion = await empresaDelUsuario(supabase);
      if (!sesion.ok) return;
      setEmpresaId(sesion.empresaId);
      const { data } = await supabase.from("empresas").select("catalogo_publico").eq("id", sesion.empresaId).single();
      setActivo(!!data?.catalogo_publico);
    })();
  }, []);

  async function cambiar(nuevo: boolean) {
    if (!empresaId) return;
    setGuardando(true);
    setError("");
    const res = await fetch("/api/catalogo/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, activo: nuevo }),
    });
    setGuardando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setError(body.error ?? "No se pudo cambiar el catálogo");
    }
    setActivo(nuevo);
  }

  if (activo === null || !empresaId) return null;

  const url = typeof window !== "undefined" ? `${window.location.origin}/catalogo/${empresaId}` : "";

  return (
    <div className="tarjeta" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0 }}>Catálogo público</h3>
      <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
        Una página con tus productos (de Stock) y su precio promedio de venta, para compartir por WhatsApp.
        No muestra nada de tus clientes ni de tus compras.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <input type="checkbox" checked={activo} onChange={(e) => cambiar(e.target.checked)} disabled={guardando} />
        Activar catálogo público
      </label>

      {error && <p className="alerta alerta-error pequeno" role="alert">{error}</p>}

      {activo && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input readOnly value={url} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.target.select()} />
          <a
            className="btn btn-primario"
            href={`https://wa.me/?text=${encodeURIComponent(`Mira nuestro catálogo: ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Compartir por WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
