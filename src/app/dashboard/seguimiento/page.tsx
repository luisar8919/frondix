"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PLANTILLA_POR_DEFECTO, PLANTILLAS, armarMensaje, enlaceWhatsApp } from "@/lib/seguimiento";

interface ClienteApi {
  clave: string; nombre: string; ultimaFecha: string; dias: number; visitas: number;
  telefono: string | null; contactadoHaceDias: number | null;
}
interface TablaApi {
  datasetId: string; nombre: string;
  seguimiento: { totalSinVolver: number; clientes: ClienteApi[]; tieneTelefono: boolean; diasSinInsistir: number } | null;
  resumen: { actual: number; anterior: number; registrosActual: number; variacion: number | null } | null;
}
interface Respuesta { negocio: string; plan: "activo" | "gratis"; dias: number; contactosDisponibles: boolean; tablas: TablaApi[] }
interface MovimientoCliente { datasetNombre: string; fecha: string | null; producto: string | null; monto: number | null }
interface HistorialApi { nombre: string; movimientos: MovimientoCliente[]; totalGastado: number; cantidadCompras: number }

const CLAVE_PLANTILLA = "frondix_plantilla_seguimiento";
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const soles0 = (n: number | null) => (n === null ? "-" : soles(n));

export default function SeguimientoPage() {
  const [dias, setDias] = useState(30);
  const [diasAplicados, setDiasAplicados] = useState(30);
  const [plantilla, setPlantilla] = useState(PLANTILLA_POR_DEFECTO);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [escritos, setEscritos] = useState<Set<string>>(new Set()); // marcados en esta sesión
  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null);
  const [historial, setHistorial] = useState<HistorialApi | null>(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  useEffect(() => {
    try { setPlantilla(localStorage.getItem(CLAVE_PLANTILLA) || PLANTILLA_POR_DEFECTO); } catch { /* sin almacenamiento */ }
  }, []);

  const cargar = useCallback(async (d: number) => {
    setCargando(true);
    setError("");
    const res = await fetch(`/api/seguimiento?dias=${d}`);
    const body = await res.json();
    setCargando(false);
    if (!res.ok) return setError(body.error ?? "No se pudo cargar el seguimiento");
    setDatos(body);
  }, []);

  useEffect(() => { cargar(diasAplicados); }, [cargar, diasAplicados]);

  function guardarPlantilla(t: string) {
    setPlantilla(t);
    try { localStorage.setItem(CLAVE_PLANTILLA, t); } catch { /* sin almacenamiento */ }
  }

  async function marcarEscrito(datasetId: string, c: ClienteApi, mensaje: string) {
    const res = await fetch("/api/seguimiento/contactos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId, cliente: c.nombre, mensaje }),
    });
    if (res.ok) setEscritos((s) => new Set(s).add(`${datasetId}|${c.clave}`));
    else if (res.status !== 503) setError((await res.json()).error ?? "No se pudo anotar el contacto");
  }

  async function alternarHistorial(clave: string, nombre: string) {
    if (historialAbierto === clave) return setHistorialAbierto(null);
    setHistorialAbierto(clave);
    setHistorial(null);
    setCargandoHistorial(true);
    const res = await fetch(`/api/clientes/historial?nombre=${encodeURIComponent(nombre)}`);
    const body = await res.json();
    setCargandoHistorial(false);
    if (res.ok) setHistorial(body);
  }

  const activo = datos?.plan === "activo";
  const negocio = datos?.negocio || "nuestro negocio";

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Seguimiento</h1>
          <p className="suave">Clientes que dejaron de venir y el mensaje listo para escribirles por WhatsApp.</p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {datos && !datos.contactosDisponibles && activo && (
        <p className="alerta alerta-aviso">Para anotar a quién ya escribiste falta ejecutar la migración 03 en Supabase.</p>
      )}

      <form className="tarjeta" style={{ marginBottom: 20 }} onSubmit={(e) => { e.preventDefault(); setDiasAplicados(dias); }}>
        <div className="campo">
          <label htmlFor="dias">Considerar que un cliente no volvió después de (días)</label>
          <input id="dias" type="number" min={1} max={365} value={dias} onChange={(e) => setDias(Math.max(1, Number(e.target.value) || 1))} style={{ maxWidth: 140 }} />
        </div>
        <div className="campo">
          <label htmlFor="plantilla-preset">Plantilla de mensaje</label>
          <select
            id="plantilla-preset"
            value={PLANTILLAS.find((p) => p.texto === plantilla)?.nombre ?? "Personalizada"}
            onChange={(e) => {
              const p = PLANTILLAS.find((x) => x.nombre === e.target.value);
              if (p) guardarPlantilla(p.texto);
            }}
            style={{ maxWidth: 320 }}
          >
            {PLANTILLAS.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}
            {!PLANTILLAS.some((p) => p.texto === plantilla) && <option value="Personalizada">Personalizada (editada por ti)</option>}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="plantilla">Mensaje. Puedes usar {"{nombre}"}, {"{negocio}"} y {"{dias}"}</label>
          <textarea id="plantilla" rows={3} value={plantilla} onChange={(e) => guardarPlantilla(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primario" disabled={cargando}>Buscar clientes</button>
      </form>

      {cargando && <p className="suave">Analizando tus módulos...</p>}

      {!cargando && datos && datos.tablas.length === 0 && (
        <div className="tarjeta">
          <h3>Aún no hay datos para el seguimiento</h3>
          <p className="suave">Necesitamos un módulo con una columna de cliente y una de fecha. Al subir tu Excel, confirma qué significa cada columna.</p>
          <Link href="/dashboard/upload" className="btn btn-primario">Subir Excel</Link>
        </div>
      )}

      {datos?.tablas.map((t) => (
        <section key={t.datasetId} className="tarjeta" style={{ marginBottom: 20 }}>
          <h3>{t.nombre}</h3>

          {t.resumen && (
            <p>
              Últimos 7 días: <strong>{soles(t.resumen.actual)}</strong> en {t.resumen.registrosActual} {t.resumen.registrosActual === 1 ? "registro" : "registros"}
              {t.resumen.variacion !== null && <> ({t.resumen.variacion >= 0 ? "+" : ""}{Math.round(t.resumen.variacion)}% frente a la semana anterior)</>}.
            </p>
          )}

          {t.seguimiento && (
            <>
              <p>
                <strong>{t.seguimiento.totalSinVolver}</strong> clientes no vuelven hace {datos.dias} días o más.
              </p>
              {!activo && t.seguimiento.totalSinVolver > 0 && (
                <p className="alerta alerta-aviso">
                  Con el plan pago ves los teléfonos y escribes con un toque.{" "}
                  <Link href="/dashboard/billing">Ver plan</Link>
                </p>
              )}
              {activo && !t.seguimiento.tieneTelefono && (
                <p className="alerta alerta-aviso">Este módulo no tiene una columna de teléfono marcada, así que no se puede escribir por WhatsApp.</p>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {t.seguimiento.clientes.map((c) => {
                  const ya = escritos.has(`${t.datasetId}|${c.clave}`) ||
                    (c.contactadoHaceDias !== null && c.contactadoHaceDias < t.seguimiento!.diasSinInsistir);
                  const mensaje = armarMensaje(plantilla, { nombre: c.nombre, negocio, dias: c.dias });
                  const claveHistorial = `${t.datasetId}|${c.clave}`;
                  return (
                    <li key={c.clave} style={{ padding: "10px 0", borderTop: "1px solid var(--linea)" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ flex: 1, minWidth: 160 }}>
                          <strong>{c.nombre}</strong><br />
                          <span className="suave">Última visita hace {c.dias} días · {c.visitas} {c.visitas === 1 ? "visita" : "visitas"}</span>
                        </span>
                        <button type="button" className="btn btn-fantasma" onClick={() => alternarHistorial(claveHistorial, c.nombre)}>
                          {historialAbierto === claveHistorial ? "Ocultar historial" : "Ver historial"}
                        </button>
                        {activo && (ya ? (
                          <span className="insignia">Ya le escribiste</span>
                        ) : c.telefono ? (
                          <>
                            <a className="btn btn-primario" href={enlaceWhatsApp(c.telefono, mensaje)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                            <button type="button" className="btn btn-fantasma" onClick={() => marcarEscrito(t.datasetId, c, mensaje)}>Ya le escribí</button>
                          </>
                        ) : (
                          <span className="suave">Sin teléfono válido</span>
                        ))}
                      </div>
                      {historialAbierto === claveHistorial && (
                        <div style={{ marginTop: 10, padding: 12, background: "var(--verde-50)", borderRadius: 8 }}>
                          {cargandoHistorial && <p className="suave pequeno">Cargando...</p>}
                          {!cargandoHistorial && historial && historial.movimientos.length === 0 && (
                            <p className="suave pequeno">No se encontraron compras de este cliente.</p>
                          )}
                          {!cargandoHistorial && historial && historial.movimientos.length > 0 && (
                            <>
                              <p className="pequeno" style={{ margin: "0 0 8px" }}>
                                <strong>{historial.cantidadCompras}</strong> {historial.cantidadCompras === 1 ? "compra" : "compras"} ·{" "}
                                total <strong>{soles(historial.totalGastado)}</strong>
                              </p>
                              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                                {historial.movimientos.map((m, i) => (
                                  <li key={i} className="pequeno" style={{ padding: "4px 0", borderTop: i > 0 ? "1px solid var(--linea)" : "none" }}>
                                    {m.fecha ?? "Sin fecha"} · {m.producto ?? "Producto sin especificar"} · {soles0(m.monto)}{" "}
                                    <span className="suave">({m.datasetNombre})</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {t.seguimiento.totalSinVolver > t.seguimiento.clientes.length && (
                <p className="suave">Mostrando {t.seguimiento.clientes.length} de {t.seguimiento.totalSinVolver}.</p>
              )}
            </>
          )}
        </section>
      ))}
    </>
  );
}
