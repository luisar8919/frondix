"use client";

import { useEffect, useState } from "react";

interface Movimiento { id: string; tipo: "venta" | "compra" | "ajuste"; cantidad: number; saldo: number; motivo: string | null; created_at: string }

const ETIQUETA_TIPO: Record<Movimiento["tipo"], string> = { venta: "Venta", compra: "Compra", ajuste: "Ajuste manual" };
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Kardex: el historial completo de un producto (no solo la cantidad actual, que
// es todo lo que guarda el módulo Stock). Se muestra como sección aparte dentro
// del propio módulo de Stock -- ver src/lib/stock.ts para de dónde sale cada fila.
export default function KardexProducto({ datasetId, productos }: { datasetId: string; productos: string[] }) {
  const [producto, setProducto] = useState("");
  const [movimientos, setMovimientos] = useState<Movimiento[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!producto) return setMovimientos(null);
    setCargando(true);
    setError("");
    fetch(`/api/kardex?datasetId=${datasetId}&producto=${encodeURIComponent(producto)}`)
      .then(async (res) => {
        const body = await res.json();
        setCargando(false);
        if (!res.ok) return setError(body.error ?? "No se pudo cargar el Kardex");
        setMovimientos(body.movimientos);
      })
      .catch(() => { setCargando(false); setError("No se pudo conectar con el servidor."); });
  }, [datasetId, producto]);

  if (productos.length === 0) return null;

  return (
    <details className="tarjeta plegable" style={{ marginBottom: 20 }}>
      <summary>Historial de un producto (Kardex)</summary>
      <div className="plegable-cuerpo">
        <div className="campo" style={{ maxWidth: 320 }}>
          <label htmlFor="kardex-producto">Producto</label>
          <select id="kardex-producto" value={producto} onChange={(e) => setProducto(e.target.value)}>
            <option value="">Elige un producto...</option>
            {productos.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {cargando && <p className="suave pequeno">Cargando...</p>}
        {error && <p className="alerta alerta-error pequeno" role="alert">{error}</p>}
        {producto && !cargando && movimientos && movimientos.length === 0 && (
          <p className="suave pequeno">Sin movimientos registrados todavía para este producto.</p>
        )}
        {movimientos && movimientos.length > 0 && (
          <div className="tabla-envoltura" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Saldo</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fechaHora(m.created_at)}</td>
                    <td>{ETIQUETA_TIPO[m.tipo]}</td>
                    <td className="num" style={{ fontWeight: 700, color: m.cantidad >= 0 ? "var(--verde-700)" : "var(--error)" }}>
                      {m.cantidad >= 0 ? "+" : ""}{m.cantidad}
                    </td>
                    <td className="num">{m.saldo}</td>
                    <td>{m.motivo ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
