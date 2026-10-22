"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Etapa = "prospecto" | "contactado" | "negociacion" | "cliente" | "perdido";
interface Tarjeta { clave: string; nombre: string; telefono: string | null; etapa: Etapa; manual: boolean; totalGastado: number }

const COLUMNAS: { etapa: Etapa; titulo: string }[] = [
  { etapa: "prospecto", titulo: "Prospecto" },
  { etapa: "contactado", titulo: "Contactado" },
  { etapa: "negociacion", titulo: "Negociación" },
  { etapa: "cliente", titulo: "Cliente" },
  { etapa: "perdido", titulo: "Perdido" },
];
const ORDEN = COLUMNAS.map((c) => c.etapa);
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

// Pipeline de ventas: en qué etapa está cada cliente o prospecto. Los que ya
// compraron algo (vienen de Ventas) empiezan en "Cliente" sola; los prospectos
// que todavía no compraron nada se agregan a mano.
export default function Pipeline() {
  const [tarjetas, setTarjetas] = useState<Tarjeta[] | null>(null);
  const [error, setError] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  // Arrastre con Pointer Events (mouse Y dedo, una sola API nativa para los
  // dos -- sin eso HTML5 drag&drop no funciona en touch/WebView). x/y es la
  // posición actual del dedo/cursor; dx/dy el punto donde lo agarró dentro de
  // la tarjeta, para que no "salte" al centro al empezar a arrastrar.
  const [arrastre, setArrastre] = useState<{ tarjeta: Tarjeta; x: number; y: number; dx: number; dy: number } | null>(null);
  const [columnaSobre, setColumnaSobre] = useState<Etapa | null>(null);

  function cargar() {
    fetch("/api/pipeline")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar el pipeline");
        setTarjetas(body.tarjetas);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }

  useEffect(() => { cargar(); }, []);

  async function moverA(t: Tarjeta, etapa: Etapa) {
    setTarjetas((ts) => (ts ?? []).map((x) => (x.clave === t.clave ? { ...x, etapa } : x)));
    const res = await fetch(`/api/pipeline/${encodeURIComponent(t.clave)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etapa, nombre: t.nombre }),
    });
    if (!res.ok) cargar(); // revierte trayendo el estado real si falló
  }

  function iniciarArrastre(e: React.PointerEvent<HTMLDivElement>, t: Tarjeta) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastre({ tarjeta: t, x: e.clientX, y: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top });
  }

  function columnaBajoPuntero(x: number, y: number): Etapa | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-columna]");
    return (el?.dataset.columna as Etapa | undefined) ?? null;
  }

  function moverArrastre(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastre) return;
    setArrastre((a) => a && { ...a, x: e.clientX, y: e.clientY });
    setColumnaSobre(columnaBajoPuntero(e.clientX, e.clientY));
  }

  function soltarArrastre(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrastre) return;
    const destino = columnaBajoPuntero(e.clientX, e.clientY);
    const t = arrastre.tarjeta;
    setArrastre(null);
    setColumnaSobre(null);
    if (destino && destino !== t.etapa) moverA(t, destino);
  }

  async function agregarProspecto(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm("");
    setEnviando(true);
    const res = await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, telefono }),
    });
    const body = await res.json();
    setEnviando(false);
    if (!res.ok) return setErrorForm(body.error ?? "No se pudo agregar el prospecto");
    setNombre(""); setTelefono(""); setAgregando(false);
    cargar();
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Pipeline</h1>
          <p className="suave">En qué etapa está cada cliente o prospecto.</p>
        </div>
        <div className="acciones">
          <button type="button" className="btn btn-primario" onClick={() => setAgregando((v) => !v)}>
            {agregando ? "Cancelar" : "+ Nuevo prospecto"}
          </button>
        </div>
      </div>

      {agregando && (
        <form onSubmit={agregarProspecto} className="tarjeta" style={{ marginBottom: 20, maxWidth: 420 }}>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label htmlFor="pl-nombre">Nombre</label>
            <input id="pl-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label htmlFor="pl-telefono">Teléfono (opcional)</label>
            <input id="pl-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          {errorForm && <p className="alerta alerta-error" role="alert">{errorForm}</p>}
          <button type="submit" className="btn btn-primario" disabled={enviando}>
            {enviando ? "Agregando..." : "Agregar prospecto"}
          </button>
        </form>
      )}

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!tarjetas && !error && <p className="suave">Cargando...</p>}

      {tarjetas && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          {COLUMNAS.map((col) => {
            const lista = tarjetas.filter((t) => t.etapa === col.etapa);
            return (
              <div
                key={col.etapa}
                data-columna={col.etapa}
                className="tarjeta"
                style={{
                  padding: 14,
                  outline: columnaSobre === col.etapa ? "2px solid var(--verde-500)" : undefined,
                  outlineOffset: -2,
                  transition: "outline-color 0.1s",
                }}
              >
                <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>{col.titulo} ({lista.length})</h3>
                {lista.map((t) => {
                  const idx = ORDEN.indexOf(t.etapa);
                  const seEstaArrastrando = arrastre?.tarjeta.clave === t.clave;
                  return (
                    <div
                      key={t.clave}
                      className="tarjeta"
                      onPointerDown={(e) => iniciarArrastre(e, t)}
                      onPointerMove={moverArrastre}
                      onPointerUp={soltarArrastre}
                      onPointerCancel={() => { setArrastre(null); setColumnaSobre(null); }}
                      style={{
                        padding: 10,
                        marginBottom: 8,
                        cursor: "grab",
                        touchAction: "none", // si no, el dedo hace scroll de la página en vez de arrastrar
                        userSelect: "none",
                        opacity: seEstaArrastrando ? 0.3 : 1,
                      }}
                    >
                      <strong style={{ fontSize: 14 }}>
                        {t.manual ? t.nombre : <Link href={`/dashboard/clientes/${encodeURIComponent(t.nombre)}`}>{t.nombre}</Link>}
                      </strong>
                      {t.telefono && <p className="suave pequeno" style={{ margin: "2px 0 0" }}>{t.telefono}</p>}
                      {t.totalGastado > 0 && <p className="suave pequeno" style={{ margin: "2px 0 0" }}>{soles(t.totalGastado)} gastado</p>}
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {idx > 0 && (
                          <button type="button" className="btn btn-fantasma" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => moverA(t, ORDEN[idx - 1])}>
                            ←
                          </button>
                        )}
                        {idx < ORDEN.length - 1 && (
                          <button type="button" className="btn btn-fantasma" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => moverA(t, ORDEN[idx + 1])}>
                            →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {lista.length === 0 && <p className="suave pequeno">Vacío.</p>}
              </div>
            );
          })}
        </div>
      )}

      {arrastre && (
        <div
          className="tarjeta"
          style={{
            position: "fixed",
            top: arrastre.y - arrastre.dy,
            left: arrastre.x - arrastre.dx,
            width: 200,
            padding: 10,
            pointerEvents: "none",
            zIndex: 1000,
            boxShadow: "var(--sombra)",
            opacity: 0.95,
          }}
        >
          <strong style={{ fontSize: 14 }}>{arrastre.tarjeta.nombre}</strong>
        </div>
      )}
    </>
  );
}
