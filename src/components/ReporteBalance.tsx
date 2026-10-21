"use client";

import { Fragment, useEffect, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { formatearMonto } from "@/lib/moneda";
import { marcarLogroCliente } from "@/lib/marcarLogro";

interface Movimiento {
  id: string;
  datasetId: string;
  datasetNombre: string;
  tipo: "venta" | "compra";
  producto: string | null;
  monto: number | null;
  moneda: string;
  fecha: string;
  sustento: string | null;
}

const soles0 = (n: number | null, moneda: string) => (n === null ? "-" : formatearMonto(n, moneda));
const fechaCorta = (f: string) => {
  const d = new Date(f.length <= 10 ? `${f}T00:00:00` : f);
  return Number.isNaN(d.getTime()) ? f : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
};

// Reporte "Balance": movimientos (ventas y compras de todos los módulos juntos,
// con su sustento) y Kardex (historial de stock por producto). Vive en su propia
// página (/dashboard/reportes) y también se embebe al final de Inicio -- mismo
// componente, mismo fetch, cero lógica duplicada.
export default function ReporteBalance() {
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [sustentoAbierto, setSustentoAbierto] = useState<string | null>(null);
  const [valorSustento, setValorSustento] = useState("");
  const [guardandoSustento, setGuardandoSustento] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Mismo cliente que el resto del panel, solo para mantener la sesión viva en esta pestaña.
    crearClienteBrowser();
    fetch("/api/reportes")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudieron cargar los reportes");
        setMovimientos(body.movimientos);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);

  function abrirSustento(m: Movimiento) {
    setSustentoAbierto(sustentoAbierto === m.id ? null : m.id);
    setValorSustento(m.sustento ?? "");
  }

  async function guardarSustento(m: Movimiento) {
    setGuardandoSustento(true);
    const res = await fetch(`/api/records/${m.datasetId}/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sustento: valorSustento }),
    });
    setGuardandoSustento(false);
    if (!res.ok) return;
    setMovimientos((ms) => (ms ?? []).map((x) => (x.id === m.id ? { ...x, sustento: valorSustento.trim() || null } : x)));
    setSustentoAbierto(null);
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h2>Balance</h2>
          <p className="suave">
            Ventas y compras de todos tus módulos juntos, lo más reciente primero. Para el Kardex de Stock, entra a Inventario.
          </p>
        </div>
        <div className="acciones no-imprimir">
          <a href="/api/export/balance" className="btn btn-secundario" onClick={() => marcarLogroCliente("exportaste_reporte")}>Exportar a Excel</a>
          <button type="button" className="btn btn-fantasma" onClick={() => { window.print(); marcarLogroCliente("exportaste_reporte"); }}>Exportar a PDF</button>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!movimientos && !error && <p className="suave">Cargando...</p>}

      {movimientos && movimientos.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay movimientos</h3>
          <p className="suave">
            Necesitas al menos un módulo con columnas marcadas como Monto, Producto o Cliente. Puedes
            agregar esos significados desde &quot;Editar tabla y campos&quot; en cualquier módulo, o al subir un Excel nuevo.
          </p>
        </div>
      )}

      {movimientos && movimientos.length > 0 && (
        <div className="tarjeta" style={{ marginBottom: 20, padding: 0 }}>
          <h3 style={{ margin: 0, padding: "16px 16px 0" }}>Últimos {movimientos.length} movimientos</h3>
          <div className="tabla-envoltura" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th className="num">Monto</th>
                  <th>Sustento</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <Fragment key={m.id}>
                    <tr>
                      <td style={{ whiteSpace: "nowrap" }}>{fechaCorta(m.fecha)}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: m.tipo === "venta" ? "var(--verde-700)" : "var(--error)" }}>
                          {m.tipo === "venta" ? "Venta" : "Compra"}
                        </span>
                      </td>
                      <td>{m.producto ?? "-"}</td>
                      <td className="num" style={{ fontWeight: 700, color: m.tipo === "venta" ? "var(--verde-700)" : "var(--error)" }}>
                        {soles0(m.monto, m.moneda)}
                      </td>
                      <td>
                        <button type="button" className="btn btn-fantasma" onClick={() => abrirSustento(m)}>
                          {m.sustento ? "✓ Sustento" : "Sustento"}
                        </button>
                      </td>
                    </tr>
                    {sustentoAbierto === m.id && (
                      <tr>
                        <td colSpan={5} style={{ background: "var(--verde-50)" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", padding: "6px 0" }}>
                            <textarea
                              value={valorSustento}
                              onChange={(e) => setValorSustento(e.target.value)}
                              placeholder="N° de boleta/factura, o cualquier referencia"
                              rows={2}
                              style={{ flex: 1, minWidth: 200 }}
                            />
                            <button type="button" className="btn btn-primario" disabled={guardandoSustento} onClick={() => guardarSustento(m)}>
                              {guardandoSustento ? "Guardando..." : "Guardar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
