"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PLANTILLAS_REPORTE } from "@/lib/plantillasReporte";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { empresaDelUsuario } from "@/lib/sesion";
import Barra from "@/components/Barra";

interface TotalMes { mes: string; total: number; registros: number }
interface RankingItem { clave: string; total: number; veces: number }
interface FlujoCaja { ventas: number; costos: number; igv: number; gananciaBruta: number; gananciaNeta: number }
interface ProgresoMeta { id: string; producto: string; objetivo: number; vendidos: number; faltan: number; porcentaje: number; alcanzada: boolean }
interface BloqueHighlight { titulo: string; texto: string }
interface Modulo {
  datasetId: string;
  nombre: string;
  plantillas: string[];
  totalesPorMes: TotalMes[] | null;
  topProducto: RankingItem[] | null;
  topCliente: RankingItem[] | null;
  topProveedor: RankingItem[] | null;
  sumaTotal: number | null;
  sumaGastos: number | null;
  flujoCaja: FlujoCaja | null;
  metas: ProgresoMeta[] | null;
}

const nombrePlantilla = Object.fromEntries(PLANTILLAS_REPORTE.map((p) => [p.id, p.nombre]));

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const nombreMes = (clave: string) => {
  const [anio, mes] = clave.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
};


export default function ReportesPage() {
  const [modulos, setModulos] = useState<Modulo[] | null>(null);
  const [error, setError] = useState("");
  const [formMeta, setFormMeta] = useState<Record<string, { producto: string; cantidad: string }>>({});
  const [errorMeta, setErrorMeta] = useState<Record<string, string>>({});
  const [guardandoMeta, setGuardandoMeta] = useState<string | null>(null);
  const [planActivo, setPlanActivo] = useState<boolean | null>(null);
  const [highlights, setHighlights] = useState<BloqueHighlight[] | null>(null);
  const [generadoEl, setGeneradoEl] = useState<string | null>(null);
  const [cargandoHighlights, setCargandoHighlights] = useState(true);
  const [errorHighlights, setErrorHighlights] = useState("");

  useEffect(() => {
    const supabase = crearClienteBrowser();
    (async () => {
      const r = await empresaDelUsuario(supabase);
      if (!r.ok) return setCargandoHighlights(false);
      const activo = await tieneSuscripcionActiva(supabase, r.empresaId);
      setPlanActivo(activo);
      if (!activo) return setCargandoHighlights(false);

      // Sin botón: se pide solo al entrar. El servidor decide si hace falta generar
      // de nuevo (pasó un día y cambiaron los números) o si devuelve lo ya guardado
      // -- entrar a Reportes varias veces el mismo día no gasta llamadas a Gemini.
      const res = await fetch("/api/highlights");
      const body = await res.json();
      setCargandoHighlights(false);
      if (!res.ok) return setErrorHighlights(body.error ?? "No se pudieron generar los highlights");
      setHighlights(body.highlights);
      setGeneradoEl(body.generadoEl);
    })();
  }, []);

  async function cargarReportes() {
    return fetch("/api/reportes")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudieron cargar los reportes");
        setModulos(body.modulos);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }

  useEffect(() => {
    cargarReportes();
  }, []);

  async function fijarMeta(datasetId: string) {
    const f = formMeta[datasetId];
    if (!f?.producto?.trim() || !f.cantidad) return;
    setGuardandoMeta(datasetId);
    setErrorMeta((e) => ({ ...e, [datasetId]: "" }));
    const res = await fetch("/api/metas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId, producto: f.producto, cantidadObjetivo: Number(f.cantidad) }),
    });
    const body = await res.json();
    if (!res.ok) {
      setGuardandoMeta(null);
      return setErrorMeta((e) => ({ ...e, [datasetId]: body.error ?? "No se pudo guardar la meta" }));
    }
    // Recarga todo: el progreso real depende de contar ventas en todo el módulo, no
    // solo el top 5 que ya tenemos en pantalla, así que no se puede calcular a mano aquí.
    await cargarReportes();
    setGuardandoMeta(null);
    setFormMeta((f) => ({ ...f, [datasetId]: { producto: "", cantidad: "" } }));
  }

  async function quitarMeta(datasetId: string, metaId: string) {
    const res = await fetch(`/api/metas/${metaId}`, { method: "DELETE" });
    if (!res.ok) return;
    setModulos((ms) => (ms ?? []).map((m) => (m.datasetId !== datasetId ? m : { ...m, metas: (m.metas ?? []).filter((x) => x.id !== metaId) })));
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Reportes generales</h1>
          <p className="suave">
            La foto completa de todos tus módulos juntos (compras y ventas combinadas). Para ver cada uno por
            separado, con su propio registro rápido, entra a Compras o Ventas.
          </p>
        </div>
      </div>

      {planActivo !== false && (
        <div className="tarjeta tarjeta-elevada" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Lo más importante, en palabras</h3>
          <p className="suave pequeno" style={{ margin: "4px 0 0" }}>
            Un reporte generado por IA (Gemini) a partir de tus totales y porcentajes ya calculados — nunca le
            mandamos una fila ni el nombre o teléfono de tus clientes, solo números. Se actualiza solo, como
            mucho una vez al día y solo si hubo cambios reales, para no gastar de más.
          </p>

          {cargandoHighlights && <p className="suave pequeno" style={{ marginTop: 14 }}>Generando...</p>}
          {errorHighlights && <p className="alerta alerta-error pequeno" role="alert" style={{ marginTop: 10 }}>{errorHighlights}</p>}
          {highlights && (
            <>
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {highlights.map((b, i) => (
                  <div key={i} className="tarjeta" style={{ padding: 14 }}>
                    <strong style={{ fontSize: 15 }}>{b.titulo}</strong>
                    <p style={{ margin: "6px 0 0", fontSize: 16, lineHeight: 1.5 }}>{b.texto}</p>
                  </div>
                ))}
              </div>
              {generadoEl && (
                <p className="suave pequeno" style={{ margin: "14px 0 0" }}>
                  Generado el {new Date(generadoEl).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {planActivo === false && (
        <div className="tarjeta" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Lo más importante, en palabras</h3>
          <p className="suave pequeno" style={{ marginTop: 10 }}>
            Los highlights con IA son parte del plan pago. <Link href="/dashboard/billing">Activa tu suscripción</Link> para usarlos.
          </p>
        </div>
      )}

      <details className="tarjeta plegable" style={{ marginBottom: 20 }}>
        <summary>Qué reportes puede armar Frondix</summary>
        <div className="plegable-cuerpo">
          <p className="suave pequeno" style={{ marginBottom: 10 }}>
            No hay que configurar nada aparte: según qué columnas marques como Monto, Costo, Fecha, Producto o
            Cliente (en &quot;Editar tabla y campos&quot; de cada módulo), se arma uno u otro automáticamente.
          </p>
          {PLANTILLAS_REPORTE.filter((p) => p.id !== "total_simple").map((p) => (
            <p key={p.id} className="pequeno" style={{ margin: "6px 0" }}>
              <strong>{p.nombre}</strong> <span className="suave">— {p.descripcion}</span>
            </p>
          ))}
        </div>
      </details>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!modulos && !error && <p className="suave">Cargando...</p>}

      {modulos && modulos.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay reportes</h3>
          <p className="suave">
            Necesitas al menos un módulo con columnas marcadas como Monto, Producto o Cliente. Puedes
            agregar esos significados desde &quot;Editar tabla y campos&quot; en cualquier módulo, o al subir un Excel nuevo.
          </p>
          <Link href="/dashboard" className="btn btn-primario">Ver mis módulos</Link>
        </div>
      )}

      {modulos?.map((m) => {
        const maxMes = Math.max(1, ...(m.totalesPorMes?.map((x) => x.total) ?? [0]));
        return (
          <section key={m.datasetId} className="tarjeta" style={{ marginBottom: 20 }}>
            <h3>{m.nombre}</h3>
            {m.plantillas.length > 0 && (
              <p className="suave pequeno" style={{ margin: "2px 0 0" }}>
                Se armó: {m.plantillas.map((id) => nombrePlantilla[id] ?? id).join(", ")}
              </p>
            )}

            {m.flujoCaja && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Flujo de caja</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>Ventas</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{soles(m.flujoCaja.ventas)}</p>
                  </div>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>Costos</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{soles(m.flujoCaja.costos)}</p>
                  </div>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>IGV (18%)</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{soles(m.flujoCaja.igv)}</p>
                  </div>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>Ganancia Bruta</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{soles(m.flujoCaja.gananciaBruta)}</p>
                  </div>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>Ganancia Neta</p>
                    <p style={{ margin: 0, fontWeight: 700, color: "var(--verde-700)" }}>{soles(m.flujoCaja.gananciaNeta)}</p>
                  </div>
                </div>
                <p className="ayuda" style={{ marginTop: 8 }}>
                  {m.flujoCaja.gananciaBruta === m.flujoCaja.gananciaNeta
                    ? "Tus ventas no incluyen IGV (o no lo marcaste en \"Editar tabla y campos\"): el IGV se suma aparte, no se resta de la ganancia."
                    : "Tus ventas ya incluyen IGV: se descontó de la ganancia bruta para calcular la neta, porque ese monto no es tuyo, es de SUNAT."}
                </p>
              </div>
            )}

            {m.sumaTotal !== null && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Total</strong>
                <p style={{ margin: "6px 0 0" }}>
                  {soles(m.sumaTotal)}
                  <span className="suave pequeno" style={{ marginLeft: 6 }}>(no tiene columna de fecha para mostrarlo por mes)</span>
                </p>
              </div>
            )}

            {m.sumaGastos !== null && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Gastos adicionales</strong>
                <p className="suave pequeno" style={{ margin: "2px 0 0" }}>Envío, comisión u otro gasto aparte del monto.</p>
                <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{soles(m.sumaGastos)}</p>
              </div>
            )}

            {m.totalesPorMes && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Total por mes (últimos 6 meses)</strong>
                <div style={{ marginTop: 10 }}>
                  {m.totalesPorMes.map((t) => (
                    <Barra key={t.mes} valor={t.total} maximo={maxMes} etiqueta={nombreMes(t.mes)} texto={soles(t.total)} />
                  ))}
                </div>
              </div>
            )}

            {m.topProducto && m.topProducto.length > 0 && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Top 5 productos</strong>
                <div style={{ marginTop: 10 }}>
                  {(() => {
                    const max = Math.max(1, ...m.topProducto.map((x) => x.total || x.veces));
                    return m.topProducto.map((p) => (
                      <Barra
                        key={p.clave}
                        valor={p.total || p.veces}
                        maximo={max}
                        etiqueta={p.clave.length > 12 ? p.clave.slice(0, 11) + "…" : p.clave}
                        texto={p.total > 0 ? soles(p.total) : `${p.veces}x`}
                      />
                    ));
                  })()}
                </div>
              </div>
            )}

            {m.topProducto && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Metas de venta</strong>
                <div style={{ marginTop: 10 }}>
                {(m.metas ?? []).map((meta) => (
                  <div key={meta.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <Barra
                      valor={meta.vendidos}
                      maximo={meta.objetivo}
                      etiqueta={meta.producto.length > 12 ? meta.producto.slice(0, 11) + "…" : meta.producto}
                      texto={meta.alcanzada ? "¡Lograda!" : `${meta.vendidos}/${meta.objetivo} (faltan ${meta.faltan})`}
                    />
                    <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={() => quitarMeta(m.datasetId, meta.id)}>
                      Quitar
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                  <div className="campo" style={{ margin: 0 }}>
                    <label htmlFor={`meta-producto-${m.datasetId}`} className="pequeno">Producto</label>
                    <input
                      id={`meta-producto-${m.datasetId}`}
                      list={`productos-${m.datasetId}`}
                      value={formMeta[m.datasetId]?.producto ?? ""}
                      onChange={(e) => setFormMeta((f) => ({ ...f, [m.datasetId]: { producto: e.target.value, cantidad: f[m.datasetId]?.cantidad ?? "" } }))}
                      style={{ width: 160 }}
                    />
                    <datalist id={`productos-${m.datasetId}`}>
                      {(m.topProducto ?? []).map((p) => <option key={p.clave} value={p.clave} />)}
                    </datalist>
                  </div>
                  <div className="campo" style={{ margin: 0 }}>
                    <label htmlFor={`meta-cantidad-${m.datasetId}`} className="pequeno">Vender cuántos</label>
                    <input
                      id={`meta-cantidad-${m.datasetId}`}
                      type="number"
                      min={1}
                      value={formMeta[m.datasetId]?.cantidad ?? ""}
                      onChange={(e) => setFormMeta((f) => ({ ...f, [m.datasetId]: { producto: f[m.datasetId]?.producto ?? "", cantidad: e.target.value } }))}
                      style={{ width: 100 }}
                    />
                  </div>
                  <button type="button" className="btn btn-secundario" onClick={() => fijarMeta(m.datasetId)} disabled={guardandoMeta === m.datasetId}>
                    {guardandoMeta === m.datasetId ? "Guardando..." : "Fijar meta"}
                  </button>
                </div>
                {errorMeta[m.datasetId] && <p className="alerta alerta-error pequeno" role="alert" style={{ marginTop: 8 }}>{errorMeta[m.datasetId]}</p>}
                </div>
              </div>
            )}

            {m.topCliente && m.topCliente.length > 0 && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Top 5 clientes</strong>
                <div style={{ marginTop: 10 }}>
                  {(() => {
                    const max = Math.max(1, ...m.topCliente.map((x) => x.total || x.veces));
                    return m.topCliente.map((c) => (
                      <Barra
                        key={c.clave}
                        valor={c.total || c.veces}
                        maximo={max}
                        etiqueta={c.clave.length > 12 ? c.clave.slice(0, 11) + "…" : c.clave}
                        texto={c.total > 0 ? soles(c.total) : `${c.veces}x`}
                      />
                    ));
                  })()}
                </div>
              </div>
            )}

            {m.topProveedor && m.topProveedor.length > 0 && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Top 5 proveedores</strong>
                <div style={{ marginTop: 10 }}>
                  {(() => {
                    const max = Math.max(1, ...m.topProveedor.map((x) => x.total || x.veces));
                    return m.topProveedor.map((p) => (
                      <Barra
                        key={p.clave}
                        valor={p.total || p.veces}
                        maximo={max}
                        etiqueta={p.clave.length > 12 ? p.clave.slice(0, 11) + "…" : p.clave}
                        texto={p.total > 0 ? soles(p.total) : `${p.veces}x`}
                      />
                    ));
                  })()}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
