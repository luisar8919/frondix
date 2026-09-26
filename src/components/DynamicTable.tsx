"use client";

import { useState } from "react";
import Link from "next/link";
import type { Columna } from "@/lib/excel-parser";
import { urlFiltrada, type RelacionEntrante } from "@/lib/enlaces";

// Dibujar miles de filas de golpe traba el navegador: se muestran por tramos.
const TRAMO = 500;

export default function DynamicTable({
  columnas,
  registros,
  relacionadas = [],
  onEditar,
  onEliminar,
}: {
  columnas: Columna[];
  registros: { id: string; data: Record<string, unknown> }[];
  // otras tablas con una columna enlazada a esta (para ir "hacia atrás")
  relacionadas?: RelacionEntrante[];
  onEditar?: (r: { id: string; data: Record<string, unknown> }) => void;
  onEliminar?: (r: { id: string; data: Record<string, unknown> }) => void;
}) {
  const [visibles, setVisibles] = useState(TRAMO);

  if (registros.length === 0) {
    return <div className="tarjeta vacio">No hay registros que coincidan.</div>;
  }

  const mostrados = registros.slice(0, visibles);
  const restantes = registros.length - mostrados.length;

  return (
    <>
      <div className="tabla-envoltura" tabIndex={0} role="region" aria-label="Tabla de datos">
        <table>
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.key} className={c.tipo === "numero" ? "num" : undefined}>{c.label}</th>
              ))}
              {relacionadas.length > 0 && <th>Relacionado</th>}
              {(onEditar || onEliminar) && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {mostrados.map((r) => (
              <tr key={r.id}>
                {columnas.map((c) => {
                  const valor = r.data[c.key];
                  const texto =
                    c.tipo === "fecha" && valor ? String(valor).slice(0, 10) : String(valor ?? "");
                  return (
                    <td key={c.key} className={c.tipo === "numero" ? "num" : undefined}>
                      {c.enlace && texto ? (
                        <Link href={urlFiltrada(c.enlace.datasetId, c.enlace.columnaKey, valor)}>{texto}</Link>
                      ) : (
                        texto
                      )}
                    </td>
                  );
                })}
                {relacionadas.length > 0 && (
                  <td>
                    {relacionadas.map((rel) => {
                      const v = r.data[rel.miColumnaKey];
                      if (v === null || v === undefined || v === "") return null;
                      return (
                        <span key={rel.datasetId + rel.columnaKey} style={{ marginRight: 12, whiteSpace: "nowrap" }}>
                          <Link href={urlFiltrada(rel.datasetId, rel.columnaKey, v)}>Ver en {rel.nombre}</Link>
                        </span>
                      );
                    })}
                  </td>
                )}
                {(onEditar || onEliminar) && (
                  <td style={{ whiteSpace: "nowrap" }}>
                    {onEditar && <button type="button" className="btn btn-fantasma" onClick={() => onEditar(r)}>Editar</button>}
                    {onEliminar && <button type="button" className="btn btn-fantasma" onClick={() => onEliminar(r)}>Eliminar</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {restantes > 0 && (
        <div className="centrado" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-secundario" onClick={() => setVisibles((v) => v + TRAMO)}>
            Mostrar {Math.min(TRAMO, restantes)} más ({restantes.toLocaleString("es-PE")} restantes)
          </button>
        </div>
      )}
    </>
  );
}
