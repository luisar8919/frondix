"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Columna } from "@/lib/excel-parser";
import { urlFiltrada, type RelacionEntrante } from "@/lib/enlaces";

// Dibujar miles de filas de golpe traba el navegador: se muestran por tramos.
const TRAMO = 500;

// Mismo criterio de conversión que DynamicForm: guardar con el tipo real
// (número, fecha ISO), no como el texto que el usuario tipeó.
function valorDesdeTexto(col: Columna, texto: string): unknown {
  if (texto === "") return null;
  if (col.tipo === "numero") return Number(texto);
  if (col.tipo === "fecha") return `${texto}T00:00:00.000Z`;
  return texto;
}

export default function DynamicTable({
  columnas,
  registros,
  relacionadas = [],
  onEditar,
  onEliminar,
  onEditarCelda,
}: {
  columnas: Columna[];
  registros: { id: string; data: Record<string, unknown> }[];
  // otras tablas con una columna enlazada a esta (para ir "hacia atrás")
  relacionadas?: RelacionEntrante[];
  onEditar?: (r: { id: string; data: Record<string, unknown> }) => void;
  onEliminar?: (r: { id: string; data: Record<string, unknown> }) => void;
  // edición rápida de un solo campo con doble clic en la celda; null = guardado
  // (o el usuario canceló una advertencia), string = mensaje de error a mostrar
  onEditarCelda?: (r: { id: string; data: Record<string, unknown> }, columna: Columna, nuevoValor: unknown) => Promise<string | null>;
}) {
  const [visibles, setVisibles] = useState(TRAMO);
  const [celda, setCelda] = useState<{ id: string; key: string } | null>(null);
  const [valorCelda, setValorCelda] = useState("");
  const [guardandoCelda, setGuardandoCelda] = useState(false);
  const [errorCelda, setErrorCelda] = useState("");
  const guardandoRef = useRef(false); // evita doble guardado: Enter dispara blur justo después

  function abrirCelda(r: { id: string; data: Record<string, unknown> }, c: Columna) {
    if (!onEditarCelda || c.enlace) return; // enlazadas se editan desde el formulario (necesitan el autocompletado)
    const v = r.data[c.key];
    setCelda({ id: r.id, key: c.key });
    setValorCelda(c.tipo === "fecha" && v ? String(v).slice(0, 10) : v === null || v === undefined ? "" : String(v));
    setErrorCelda("");
  }

  async function guardarCelda(r: { id: string; data: Record<string, unknown> }, c: Columna) {
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardandoCelda(true);
    const error = await onEditarCelda!(r, c, valorDesdeTexto(c, valorCelda));
    guardandoRef.current = false;
    setGuardandoCelda(false);
    if (error) return setErrorCelda(error);
    setCelda(null);
  }

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
                  const editandoEstaCelda = celda?.id === r.id && celda.key === c.key;
                  return (
                    <td
                      key={c.key}
                      className={c.tipo === "numero" ? "num" : undefined}
                      onDoubleClick={() => abrirCelda(r, c)}
                      title={onEditarCelda && !c.enlace ? "Doble clic para editar" : undefined}
                    >
                      {editandoEstaCelda ? (
                        <>
                          <input
                            autoFocus
                            type={c.tipo === "numero" ? "number" : c.tipo === "fecha" ? "date" : "text"}
                            step={c.tipo === "numero" ? "any" : undefined}
                            value={valorCelda}
                            disabled={guardandoCelda}
                            onChange={(e) => setValorCelda(e.target.value)}
                            onBlur={() => guardarCelda(r, c)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); guardarCelda(r, c); }
                              if (e.key === "Escape") setCelda(null);
                            }}
                            style={{ width: "100%", minWidth: 80 }}
                          />
                          {errorCelda && <span className="alerta alerta-error" style={{ display: "block", fontSize: 11, padding: "2px 6px" }}>{errorCelda}</span>}
                        </>
                      ) : c.enlace && texto ? (
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
