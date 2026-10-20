"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Item { recordId: string; datasetId: string; datasetNombre: string; actualizadoEn: string; actualizadoPor: string | null; esNuevo: boolean }

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Historial de auditoría mínimo: los últimos 200 registros creados o editados
// en cualquier módulo, con quién y cuándo (ver /api/actividad). No es un
// historial de cambios campo a campo, solo "quién tocó esto último".
export default function Actividad() {
  const [actividad, setActividad] = useState<Item[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/actividad")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar la actividad");
        setActividad(body.actividad);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Actividad</h1>
          <p className="suave">Quién creó o editó cada registro por última vez, en todos tus módulos. Los últimos 200.</p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!actividad && !error && <p className="suave">Cargando...</p>}

      {actividad && actividad.length === 0 && (
        <div className="tarjeta"><p className="suave">Todavía no hay registros.</p></div>
      )}

      {actividad && actividad.length > 0 && (
        <div className="tabla-envoltura">
          <table>
            <thead>
              <tr>
                <th>Módulo</th>
                <th>Acción</th>
                <th>Quién</th>
                <th>Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {actividad.map((a) => (
                <tr key={a.recordId}>
                  <td><Link href={`/dashboard/${a.datasetId}`}>{a.datasetNombre}</Link></td>
                  <td>{a.esNuevo ? "Creado" : "Editado"}</td>
                  <td>{a.actualizadoPor ?? <span className="suave">-</span>}</td>
                  <td className="suave">{fechaHora(a.actualizadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
