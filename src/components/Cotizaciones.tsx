"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { enlaceWhatsApp } from "@/lib/seguimiento";

interface Cotizacion {
  id: string;
  cliente: string;
  producto: string;
  monto: number;
  fecha: string;
  estado: "pendiente" | "aceptada" | "rechazada";
  notas: string | null;
  telefono: string | null;
  token: string;
  venta_dataset_id: string | null;
  created_at: string;
}

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
const ETIQUETA_ESTADO: Record<Cotizacion["estado"], string> = { pendiente: "Pendiente", aceptada: "Aceptada", rechazada: "Rechazada" };
const CLASE_ESTADO: Record<Cotizacion["estado"], string> = { pendiente: "alerta-aviso", aceptada: "alerta-ok", rechazada: "alerta-error" };

// Cotizaciones: un paso antes de la venta confirmada. Al aceptar una, se crea
// el registro real en tu módulo de Ventas -- ver /api/cotizaciones/[id].
export default function Cotizaciones() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[] | null>(null);
  const [error, setError] = useState("");

  const [cliente, setCliente] = useState("");
  const [producto, setProducto] = useState("");
  const [monto, setMonto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  const [pegarWhatsapp, setPegarWhatsapp] = useState(false);
  const [textoWhatsapp, setTextoWhatsapp] = useState("");
  const [leyendoIA, setLeyendoIA] = useState(false);
  const [errorIA, setErrorIA] = useState("");

  const [procesando, setProcesando] = useState<string | null>(null);
  const [eligiendoModulo, setEligiendoModulo] = useState<{ cotizacionId: string; datasets: { id: string; nombre: string }[] } | null>(null);

  function cargar() {
    fetch("/api/cotizaciones")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar las cotizaciones");
        setCotizaciones(body.cotizaciones);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }

  useEffect(cargar, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErrorForm("");
    const res = await fetch("/api/cotizaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente, producto, monto, notas, telefono }),
    });
    setEnviando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErrorForm(body.error ?? "No se pudo guardar la cotización");
    }
    setCliente(""); setProducto(""); setMonto(""); setTelefono(""); setNotas(""); setTextoWhatsapp(""); setPegarWhatsapp(false);
    cargar();
  }

  // Pega un pedido tal cual llegó por WhatsApp y la IA lo convierte en los
  // campos del formulario -- mismo motor que /api/datasets/sugerir-ia (Gemini,
  // gated a plan pago), un paso antes de Crear cotización en vez de reemplazarlo.
  async function leerConIA() {
    if (!textoWhatsapp.trim()) return;
    setLeyendoIA(true);
    setErrorIA("");
    const res = await fetch("/api/cotizaciones/sugerir-ia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: textoWhatsapp }),
    });
    setLeyendoIA(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setErrorIA(body.error ?? "No se pudo leer el texto");
    if (body.cliente) setCliente(body.cliente);
    if (body.producto) setProducto(body.producto);
    if (body.monto) setMonto(String(body.monto));
    if (body.telefono) setTelefono(body.telefono);
    setPegarWhatsapp(false);
  }

  async function cambiarEstado(id: string, estado: "aceptada" | "rechazada", datasetId?: string) {
    setProcesando(id);
    setError("");
    const res = await fetch(`/api/cotizaciones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado, datasetId }),
    });
    setProcesando(null);
    const body = await res.json().catch(() => ({}));
    if (res.status === 409 && body.datasets) {
      setEligiendoModulo({ cotizacionId: id, datasets: body.datasets });
      return;
    }
    if (!res.ok) { setError(body.error ?? "No se pudo actualizar la cotización"); return; }
    setEligiendoModulo(null);
    cargar();
  }

  async function borrar(id: string) {
    const res = await fetch(`/api/cotizaciones/${id}`, { method: "DELETE" });
    if (res.ok) setCotizaciones((cs) => (cs ?? []).filter((c) => c.id !== id));
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Cotizaciones</h1>
          <p className="suave">Lo que le ofreciste a un cliente, antes de que confirme la venta.</p>
        </div>
      </div>

      <form onSubmit={crear} className="tarjeta" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0 }}>Nueva cotización</h3>
          <button type="button" className="btn btn-fantasma pequeno" onClick={() => setPegarWhatsapp((v) => !v)}>
            {pegarWhatsapp ? "Cancelar" : "Pegar de WhatsApp"}
          </button>
        </div>

        {pegarWhatsapp && (
          <div className="campo" style={{ marginBottom: 14 }}>
            <label htmlFor="cot-whatsapp">Pega el pedido tal cual te llegó</label>
            <textarea
              id="cot-whatsapp"
              rows={3}
              value={textoWhatsapp}
              onChange={(e) => setTextoWhatsapp(e.target.value)}
              placeholder="Hola, quería cotizar 2 llantas aro 15, mi número es 987654321"
            />
            {errorIA && <p className="alerta alerta-error pequeno" role="alert">{errorIA}</p>}
            <button type="button" className="btn btn-secundario" disabled={leyendoIA || !textoWhatsapp.trim()} style={{ marginTop: 8 }} onClick={leerConIA}>
              {leyendoIA ? "Leyendo..." : "Completar con IA"}
            </button>
          </div>
        )}

        <div className="grilla-form">
          <div className="campo">
            <label htmlFor="cot-cliente">Cliente</label>
            <input id="cot-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} required maxLength={120} />
          </div>
          <div className="campo">
            <label htmlFor="cot-producto">Producto o servicio</label>
            <input id="cot-producto" value={producto} onChange={(e) => setProducto(e.target.value)} required maxLength={120} />
          </div>
          <div className="campo">
            <label htmlFor="cot-monto">Monto</label>
            <input id="cot-monto" type="number" step="any" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} required />
          </div>
          <div className="campo">
            <label htmlFor="cot-telefono">Teléfono (opcional, para WhatsApp)</label>
            <input id="cot-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={20} placeholder="987654321" />
          </div>
          <div className="campo">
            <label htmlFor="cot-notas">Notas (opcional)</label>
            <input id="cot-notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={200} />
          </div>
        </div>
        {errorForm && <p className="alerta alerta-error" role="alert">{errorForm}</p>}
        <button type="submit" className="btn btn-primario" disabled={enviando} style={{ marginTop: 10 }}>
          {enviando ? "Guardando..." : "Crear cotización"}
        </button>
      </form>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!cotizaciones && !error && <p className="suave">Cargando...</p>}
      {cotizaciones && cotizaciones.length === 0 && <div className="tarjeta vacio">Todavía no hay cotizaciones.</div>}

      {cotizaciones && cotizaciones.length > 0 && (
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Producto</th>
                <th className="num">Monto</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((c) => (
                <tr key={c.id}>
                  <td>{fechaCorta(c.fecha)}</td>
                  <td>{c.cliente}</td>
                  <td>{c.producto}</td>
                  <td className="num">{soles(c.monto)}</td>
                  <td><span className={`alerta ${CLASE_ESTADO[c.estado]} pequeno`} style={{ padding: "2px 10px" }}>{ETIQUETA_ESTADO[c.estado]}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {c.estado === "pendiente" && c.telefono && (
                      <a
                        href={enlaceWhatsApp(
                          c.telefono,
                          `Hola ${c.cliente}, tu cotización por ${soles(c.monto)} (${c.producto}) está lista. Confírmala aquí: ${typeof window !== "undefined" ? window.location.origin : "https://www.frondix.com"}/cotizar/${c.id}?token=${c.token}`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-fantasma"
                      >
                        Enviar WhatsApp
                      </a>
                    )}
                    {c.estado === "pendiente" && (
                      <>
                        <button type="button" className="btn btn-fantasma" disabled={procesando === c.id} onClick={() => cambiarEstado(c.id, "aceptada")}>
                          {procesando === c.id ? "..." : "Aceptar"}
                        </button>
                        <button type="button" className="btn btn-fantasma" disabled={procesando === c.id} onClick={() => cambiarEstado(c.id, "rechazada")}>
                          Rechazar
                        </button>
                      </>
                    )}
                    {c.estado === "aceptada" && c.venta_dataset_id && (
                      <Link href={`/dashboard/${c.venta_dataset_id}`} className="suave pequeno">Ver venta</Link>
                    )}
                    <button type="button" className="btn btn-fantasma" onClick={() => borrar(c.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {eligiendoModulo && (
        <div className="tarjeta tarjeta-elevada" style={{ marginTop: 16, maxWidth: 420 }}>
          <h3 style={{ marginTop: 0 }}>¿A qué módulo de Ventas va?</h3>
          <p className="suave pequeno">Tienes más de uno, elige dónde se registra esta venta.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {eligiendoModulo.datasets.map((d) => (
              <button key={d.id} type="button" className="btn btn-secundario" onClick={() => cambiarEstado(eligiendoModulo.cotizacionId, "aceptada", d.id)}>
                {d.nombre}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-fantasma" style={{ marginTop: 10 }} onClick={() => setEligiendoModulo(null)}>Cancelar</button>
        </div>
      )}
    </>
  );
}
