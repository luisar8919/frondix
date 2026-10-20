"use client";

import { useEffect, useState } from "react";

interface Item { id: string; producto: string; cantidad: number; costo_unitario: number | null }
interface Orden { id: string; proveedor: string; estado: "pendiente" | "recibida" | "cancelada"; fecha_pedido: string; fecha_recepcion: string | null; notas: string | null; orden_compra_items: Item[] }
interface ItemForm { producto: string; cantidad: string; costoUnitario: string }

const ITEM_VACIO: ItemForm = { producto: "", cantidad: "", costoUnitario: "" };
const ETIQUETA_ESTADO: Record<Orden["estado"], string> = { pendiente: "Pendiente", recibida: "Recibida", cancelada: "Cancelada" };
const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

// Lo que le pediste a un proveedor y todavía (o ya) te llegó -- separado de las
// compras ya registradas en un módulo, que es lo que YA compraste de verdad.
export default function OrdenesCompra() {
  const [ordenes, setOrdenes] = useState<Orden[] | null>(null);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [proveedor, setProveedor] = useState("");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<ItemForm[]>([{ ...ITEM_VACIO }]);
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  function cargar() {
    fetch("/api/ordenes-compra")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudieron cargar las órdenes de compra");
        setOrdenes(body.ordenes);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }

  useEffect(() => { cargar(); }, []);

  function actualizarItem(i: number, campo: keyof ItemForm, valor: string) {
    setItems((its) => its.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  }

  async function crearOrden(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm("");
    setEnviando(true);
    const res = await fetch("/api/ordenes-compra", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proveedor,
        notas,
        items: items.filter((it) => it.producto.trim()).map((it) => ({ producto: it.producto, cantidad: it.cantidad, costoUnitario: it.costoUnitario || undefined })),
      }),
    });
    const body = await res.json();
    setEnviando(false);
    if (!res.ok) return setErrorForm(body.error ?? "No se pudo crear la orden");
    setProveedor(""); setNotas(""); setItems([{ ...ITEM_VACIO }]); setCreando(false);
    cargar();
  }

  async function cambiarEstado(id: string, estado: Orden["estado"]) {
    const res = await fetch(`/api/ordenes-compra/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    if (res.ok) cargar();
  }

  const porEstado = (estado: Orden["estado"]) => (ordenes ?? []).filter((o) => o.estado === estado);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Órdenes de compra</h1>
          <p className="suave">Lo que le pediste a cada proveedor, aparte de lo que ya registraste como compra.</p>
        </div>
        <div className="acciones">
          <button type="button" className="btn btn-primario" onClick={() => setCreando((v) => !v)}>
            {creando ? "Cancelar" : "+ Nueva orden"}
          </button>
        </div>
      </div>

      {creando && (
        <form onSubmit={crearOrden} className="tarjeta" style={{ marginBottom: 20, maxWidth: 560 }}>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label htmlFor="oc-proveedor">Proveedor</label>
            <input id="oc-proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} required />
          </div>

          <label className="pequeno" style={{ display: "block", marginBottom: 6 }}>Productos</label>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <input placeholder="Producto" value={it.producto} onChange={(e) => actualizarItem(i, "producto", e.target.value)} style={{ flex: 2, minWidth: 140 }} />
              <input placeholder="Cantidad" type="number" min={0} value={it.cantidad} onChange={(e) => actualizarItem(i, "cantidad", e.target.value)} style={{ flex: 1, minWidth: 90 }} />
              <input placeholder="Costo unit. (opcional)" type="number" min={0} value={it.costoUnitario} onChange={(e) => actualizarItem(i, "costoUnitario", e.target.value)} style={{ flex: 1, minWidth: 110 }} />
            </div>
          ))}
          <button type="button" className="btn btn-fantasma" style={{ marginBottom: 14 }} onClick={() => setItems((its) => [...its, { ...ITEM_VACIO }])}>
            + Agregar producto
          </button>

          <div className="campo" style={{ marginBottom: 10 }}>
            <label htmlFor="oc-notas">Notas (opcional)</label>
            <textarea id="oc-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>

          {errorForm && <p className="alerta alerta-error" role="alert">{errorForm}</p>}
          <button type="submit" className="btn btn-primario" disabled={enviando}>
            {enviando ? "Creando..." : "Crear orden"}
          </button>
        </form>
      )}

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!ordenes && !error && <p className="suave">Cargando...</p>}

      {ordenes && ordenes.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay órdenes de compra</h3>
          <p className="suave">Creá una cuando le pidas algo a un proveedor, para no perderle el rastro hasta que llegue.</p>
        </div>
      )}

      {(["pendiente", "recibida", "cancelada"] as const).map((estado) => {
        const lista = porEstado(estado);
        if (lista.length === 0) return null;
        return (
          <section key={estado} style={{ marginBottom: 20 }}>
            <h3>{ETIQUETA_ESTADO[estado]} ({lista.length})</h3>
            {lista.map((o) => (
              <div key={o.id} className="tarjeta" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <strong>{o.proveedor}</strong>
                    <p className="suave pequeno" style={{ margin: "2px 0 0" }}>
                      Pedido el {fechaCorta(o.fecha_pedido)}{o.fecha_recepcion && ` · Recibida el ${fechaCorta(o.fecha_recepcion)}`}
                    </p>
                  </div>
                  {estado === "pendiente" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn btn-secundario" style={{ padding: "4px 12px" }} onClick={() => cambiarEstado(o.id, "recibida")}>
                        Marcar recibida
                      </button>
                      <button type="button" className="btn btn-fantasma" style={{ padding: "4px 12px" }} onClick={() => cambiarEstado(o.id, "cancelada")}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
                <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                  {o.orden_compra_items.map((it) => (
                    <li key={it.id} className="pequeno">
                      {it.producto} — {it.cantidad}{it.costo_unitario ? ` (S/ ${it.costo_unitario} c/u)` : ""}
                    </li>
                  ))}
                </ul>
                {o.notas && <p className="suave pequeno" style={{ margin: "8px 0 0" }}>{o.notas}</p>}
                {estado === "recibida" && (
                  <p className="ayuda" style={{ marginTop: 8 }}>
                    Recordá registrar esta compra en tu módulo de Compras para que se refleje en costos y stock.
                  </p>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
