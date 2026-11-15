"use client";

import { useEffect, useState } from "react";
import ValorizacionStock from "@/components/ValorizacionStock";
import KardexProducto from "@/components/KardexProducto";
import CatalogoCompartir from "@/components/CatalogoCompartir";

interface ModuloStock { datasetId: string; nombre: string; productos: string[] }
interface StockPorAlmacen { datasetId: string; datasetNombre: string; cantidad: number }
interface ProductoCombinado { producto: string; total: number; porAlmacen: StockPorAlmacen[] }

// "Módulos > Stock > Reporte": valorización de mercadería, el total combinado
// cuando hay más de un almacén (cada módulo de Stock es, en los hechos, un
// almacén propio), y el Kardex de cada producto. Las alertas de stock por
// agotarse viven aparte, en "Seguimiento > Alertas" (ver AlertasStock.tsx).
export default function InventarioResumen() {
  const [stock, setStock] = useState<ModuloStock[] | null>(null);
  const [combinado, setCombinado] = useState<ProductoCombinado[]>([]);
  const [traslado, setTraslado] = useState({ origen: "", destino: "", producto: "", cantidad: "" });
  const [trasladando, setTrasladando] = useState(false);
  const [mensajeTraslado, setMensajeTraslado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  function cargar() {
    fetch("/api/inventario")
      .then((res) => res.json())
      .then((body) => { setStock(body.stock ?? []); setCombinado(body.combinado ?? []); })
      .catch(() => setStock([]));
  }

  useEffect(cargar, []);

  const hayMultiAlmacen = stock && stock.length > 1;

  async function trasladar(e: React.FormEvent) {
    e.preventDefault();
    setMensajeTraslado(null);
    setTrasladando(true);
    const res = await fetch("/api/inventario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origenDatasetId: traslado.origen,
        destinoDatasetId: traslado.destino,
        producto: traslado.producto,
        cantidad: Number(traslado.cantidad),
      }),
    });
    const body = await res.json().catch(() => ({}));
    setTrasladando(false);
    if (!res.ok) return setMensajeTraslado({ tipo: "error", texto: body.error ?? "No se pudo trasladar el stock" });
    setMensajeTraslado({ tipo: "ok", texto: `Se trasladaron ${traslado.cantidad} unidades de "${traslado.producto}".` });
    setTraslado({ origen: traslado.origen, destino: traslado.destino, producto: "", cantidad: "" });
    cargar();
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Stock</h1>
          <p className="suave">Cuánto vale tu mercadería y el historial de cada producto.</p>
        </div>
      </div>

      <ValorizacionStock />
      <CatalogoCompartir />

      {hayMultiAlmacen && combinado.length > 0 && (
        <div className="tarjeta" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Total combinado por producto</h3>
          <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
            Sumando los {stock.length} módulos de Stock que tienes ({stock.map((s) => s.nombre).join(", ")}).
          </p>
          <div className="tabla-envoltura" style={{ boxShadow: "none", border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Total</th>
                  <th>Por almacén</th>
                </tr>
              </thead>
              <tbody>
                {combinado.map((p) => (
                  <tr key={p.producto}>
                    <td>{p.producto}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{p.total}</td>
                    <td className="suave pequeno">
                      {p.porAlmacen.map((a) => `${a.datasetNombre}: ${a.cantidad}`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hayMultiAlmacen && (
        <div className="tarjeta" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Trasladar stock entre almacenes</h3>
          <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
            Resta del almacén de origen y suma al destino -- queda registrado en el Kardex de ambos.
          </p>
          <form onSubmit={trasladar} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="campo" style={{ margin: 0 }}>
              <label className="pequeno">Producto</label>
              <input
                list="productos-traslado"
                value={traslado.producto}
                onChange={(e) => setTraslado((t) => ({ ...t, producto: e.target.value }))}
                style={{ width: 180 }}
                required
              />
              <datalist id="productos-traslado">
                {combinado.map((p) => <option key={p.producto} value={p.producto} />)}
              </datalist>
            </div>
            <div className="campo" style={{ margin: 0 }}>
              <label className="pequeno">Desde</label>
              <select value={traslado.origen} onChange={(e) => setTraslado((t) => ({ ...t, origen: e.target.value }))} required>
                <option value="" disabled>Elige un almacén...</option>
                {stock!.map((s) => <option key={s.datasetId} value={s.datasetId}>{s.nombre}</option>)}
              </select>
            </div>
            <div className="campo" style={{ margin: 0 }}>
              <label className="pequeno">Hacia</label>
              <select value={traslado.destino} onChange={(e) => setTraslado((t) => ({ ...t, destino: e.target.value }))} required>
                <option value="" disabled>Elige un almacén...</option>
                {stock!.filter((s) => s.datasetId !== traslado.origen).map((s) => <option key={s.datasetId} value={s.datasetId}>{s.nombre}</option>)}
              </select>
            </div>
            <div className="campo" style={{ margin: 0 }}>
              <label className="pequeno">Cantidad</label>
              <input
                type="number"
                min={1}
                value={traslado.cantidad}
                onChange={(e) => setTraslado((t) => ({ ...t, cantidad: e.target.value }))}
                style={{ width: 90 }}
                required
              />
            </div>
            <button type="submit" className="btn btn-primario" disabled={trasladando}>
              {trasladando ? "Trasladando..." : "Trasladar"}
            </button>
          </form>
          {mensajeTraslado && (
            <p className={`alerta ${mensajeTraslado.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status" style={{ marginTop: 10 }}>
              {mensajeTraslado.texto}
            </p>
          )}
        </div>
      )}

      {stock?.map((s) => <KardexProducto key={s.datasetId} datasetId={s.datasetId} productos={s.productos} />)}
    </>
  );
}
