"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Proveedor { clave: string; nombre: string; ultimaFecha: string; visitas: number; telefono: string | null; totalComprado: number; manual: boolean }

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

// Ficha de proveedor: espejo de ListaClientes.tsx -- todos los que te
// vendieron algo, más los que agregaste a mano sin ninguna compra todavía.
export default function ListaProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[] | null>(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch("/api/proveedores")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar la lista de proveedores");
        setProveedores(body.proveedores);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);

  const filtrados = proveedores?.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase())) ?? [];

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Proveedores</h1>
          <p className="suave">Todos a los que les compraste algo, más los que agregaste a mano.</p>
        </div>
        <div className="acciones">
          <Link href="/dashboard/proveedores/nuevo" className="btn btn-primario">+ Nuevo proveedor</Link>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!proveedores && !error && <p className="suave">Cargando...</p>}

      {proveedores && proveedores.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay proveedores</h3>
          <p className="suave">
            Necesitas al menos un módulo de Compras con columnas marcadas como Proveedor y Fecha, o agrega uno a mano.
          </p>
        </div>
      )}

      {proveedores && proveedores.length > 0 && (
        <>
          <div className="campo" style={{ maxWidth: 320, marginBottom: 16 }}>
            <label htmlFor="busqueda-proveedor">Buscar</label>
            <input id="busqueda-proveedor" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre del proveedor..." />
          </div>

          <div className="tabla-envoltura">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th className="num">Compras</th>
                  <th>Última compra</th>
                  <th className="num">Total comprado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.clave}>
                    <td><Link href={`/dashboard/proveedores/${encodeURIComponent(p.nombre)}`}>{p.nombre}</Link></td>
                    <td>{p.telefono ?? "-"}</td>
                    <td className="num">{p.visitas}</td>
                    <td>{p.manual ? <span className="suave pequeno">Sin compras aún</span> : fechaCorta(p.ultimaFecha)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{soles(p.totalComprado)}</td>
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
