"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Cliente { clave: string; nombre: string; ultimaFecha: string; visitas: number; telefono: string | null; totalGastado: number; manual: boolean }

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

// Ficha de cliente: lista de todos los que compraron algo, con buscador por
// nombre. Cada uno abre su propia página con historial de compras y notas.
export default function ListaClientes() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<string | null>(null); // clave del cliente cuyo teléfono se está editando
  const [telefonoEditado, setTelefonoEditado] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    fetch("/api/clientes")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar la lista de clientes");
        setClientes(body.clientes);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }

  useEffect(cargar, []);

  async function guardarTelefono(nombre: string) {
    setGuardando(true);
    const res = await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, telefono: telefonoEditado }),
    });
    setGuardando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setError(body.error ?? "No se pudo guardar el teléfono");
    }
    setEditando(null);
    cargar();
  }

  const filtrados = clientes?.filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase())) ?? [];

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Clientes</h1>
          <p className="suave">Todos los que te compraron algo, con su historial y notas.</p>
        </div>
        <div className="acciones">
          <Link href="/dashboard/clientes/nuevo" className="btn btn-primario">+ Nuevo cliente</Link>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!clientes && !error && <p className="suave">Cargando...</p>}

      {clientes && clientes.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay clientes</h3>
          <p className="suave">
            Necesitas al menos un módulo de Ventas con columnas marcadas como Cliente y Fecha, o agrega uno a mano.
          </p>
        </div>
      )}

      {clientes && clientes.length > 0 && (
        <>
          <div className="campo" style={{ maxWidth: 320, marginBottom: 16 }}>
            <label htmlFor="busqueda-cliente">Buscar</label>
            <input id="busqueda-cliente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre del cliente..." />
          </div>

          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th className="num">Visitas</th>
                  <th>Última compra</th>
                  <th className="num">Total gastado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.clave}>
                    <td><Link href={`/dashboard/clientes/${encodeURIComponent(c.nombre)}`}>{c.nombre}</Link></td>
                    <td>
                      {editando === c.clave ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            value={telefonoEditado}
                            onChange={(e) => setTelefonoEditado(e.target.value)}
                            maxLength={30}
                            style={{ width: 130 }}
                            autoFocus
                          />
                          <button type="button" className="btn btn-fantasma pequeno" disabled={guardando} onClick={() => guardarTelefono(c.nombre)}>
                            {guardando ? "..." : "Guardar"}
                          </button>
                          <button type="button" className="btn btn-fantasma pequeno" onClick={() => setEditando(null)}>Cancelar</button>
                        </div>
                      ) : (
                        <>
                          {c.telefono ?? "-"}{" "}
                          <button
                            type="button"
                            className="btn btn-fantasma pequeno"
                            style={{ padding: "0 6px" }}
                            onClick={() => { setEditando(c.clave); setTelefonoEditado(c.telefono ?? ""); }}
                          >
                            Editar
                          </button>
                        </>
                      )}
                    </td>
                    <td className="num">{c.visitas}</td>
                    <td>{c.manual ? <span className="suave pequeno">Sin compras aún</span> : fechaCorta(c.ultimaFecha)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{soles(c.totalGastado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
