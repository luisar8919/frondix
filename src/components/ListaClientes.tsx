"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Cliente { clave: string; nombre: string; ultimaFecha: string; visitas: number; telefono: string | null; totalGastado: number }

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

// Ficha de cliente: lista de todos los que compraron algo, con buscador por
// nombre. Cada uno abre su propia página con historial de compras y notas.
export default function ListaClientes() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch("/api/clientes")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar la lista de clientes");
        setClientes(body.clientes);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);

  const filtrados = clientes?.filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase())) ?? [];

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Clientes</h1>
          <p className="suave">Todos los que te compraron algo, con su historial y notas.</p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!clientes && !error && <p className="suave">Cargando...</p>}

      {clientes && clientes.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay clientes</h3>
          <p className="suave">
            Necesitas al menos un módulo de Ventas con columnas marcadas como Cliente y Fecha.
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
                    <td>{c.telefono ?? "-"}</td>
                    <td className="num">{c.visitas}</td>
                    <td>{fechaCorta(c.ultimaFecha)}</td>
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
