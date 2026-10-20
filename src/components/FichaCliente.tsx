"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Movimiento { datasetNombre: string; fecha: string | null; producto: string | null; monto: number | null }
interface Historial { nombre: string; movimientos: Movimiento[]; totalGastado: number; cantidadCompras: number }
interface Nota { id: string; texto: string; created_at: string }

const soles = (n: number | null) => (n === null ? "-" : `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`);
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Ficha de un cliente puntual: su historial de compras (ya existía, se usaba
// en el popover de Seguimiento) + notas de texto libre, ahora en su propia
// página en vez de un desplegable.
export default function FichaCliente({ nombre }: { nombre: string }) {
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [error, setError] = useState("");
  const [nuevaNota, setNuevaNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorNota, setErrorNota] = useState("");

  function cargarNotas() {
    fetch(`/api/clientes/notas?nombre=${encodeURIComponent(nombre)}`)
      .then((res) => res.json())
      .then((body) => setNotas(body.notas ?? []))
      .catch(() => setNotas([]));
  }

  useEffect(() => {
    fetch(`/api/clientes/historial?nombre=${encodeURIComponent(nombre)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar el historial");
        setHistorial(body);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
    cargarNotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre]);

  async function agregarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaNota.trim()) return;
    setGuardando(true);
    setErrorNota("");
    const res = await fetch("/api/clientes/notas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, texto: nuevaNota }),
    });
    setGuardando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErrorNota(body.error ?? "No se pudo guardar la nota");
    }
    setNuevaNota("");
    cargarNotas();
  }

  async function borrarNota(id: string) {
    const res = await fetch(`/api/clientes/notas/${id}`, { method: "DELETE" });
    if (res.ok) setNotas((ns) => (ns ?? []).filter((n) => n.id !== id));
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <p className="suave pequeno" style={{ margin: "0 0 4px" }}><Link href="/dashboard/clientes">← Clientes</Link></p>
          <h1>{nombre}</h1>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}

      {historial && (
        <div className="tarjeta" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <p className="suave pequeno" style={{ margin: 0 }}>Compras</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 20 }}>{historial.cantidadCompras}</p>
            </div>
            <div>
              <p className="suave pequeno" style={{ margin: 0 }}>Total gastado</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 20, color: "var(--verde-700)" }}>{soles(historial.totalGastado)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="tarjeta" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Notas</h3>
        <form onSubmit={agregarNota} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <textarea
            value={nuevaNota}
            onChange={(e) => setNuevaNota(e.target.value)}
            placeholder="Preferencias, acuerdos, lo que necesites recordar de este cliente..."
            rows={2}
            style={{ flex: 1, minWidth: 220 }}
          />
          <button type="submit" className="btn btn-primario" disabled={guardando}>
            {guardando ? "Guardando..." : "Agregar nota"}
          </button>
        </form>
        {errorNota && <p className="alerta alerta-error pequeno" role="alert">{errorNota}</p>}

        {notas === null && <p className="suave pequeno">Cargando...</p>}
        {notas && notas.length === 0 && <p className="suave pequeno">Todavía no hay notas de este cliente.</p>}
        {notas?.map((n) => (
          <div key={n.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: "1px solid var(--linea)" }}>
            <div>
              <p style={{ margin: 0 }}>{n.texto}</p>
              <p className="suave pequeno" style={{ margin: "2px 0 0" }}>{fechaHora(n.created_at)}</p>
            </div>
            <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px", height: "fit-content" }} onClick={() => borrarNota(n.id)}>
              Borrar
            </button>
          </div>
        ))}
      </div>

      {historial && historial.movimientos.length > 0 && (
        <div className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Historial de compras</h3>
          <div className="tabla-envoltura" style={{ boxShadow: "none", border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Módulo</th>
                  <th className="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                {historial.movimientos.map((m, i) => (
                  <tr key={i}>
                    <td>{m.fecha ?? "-"}</td>
                    <td>{m.producto ?? "-"}</td>
                    <td className="suave">{m.datasetNombre}</td>
                    <td className="num">{soles(m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
