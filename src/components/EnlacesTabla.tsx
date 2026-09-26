"use client";

import { useState } from "react";
import type { Columna } from "@/lib/excel-parser";
import { opcionesDeEnlace, codificarEnlace, decodificarEnlace, type DatasetResumen } from "@/lib/enlaces";

// Permite decir "los valores de esta columna vienen de otra tabla" (por ejemplo, el
// Cliente de una venta debe existir en la tabla Clientes).
export default function EnlacesTabla({
  datasetId,
  columnas,
  otras,
  onGuardado,
}: {
  datasetId: string;
  columnas: Columna[];
  otras: DatasetResumen[];
  onGuardado: () => Promise<void>;
}) {
  const opciones = opcionesDeEnlace(otras, datasetId);
  const [seleccion, setSeleccion] = useState<Record<string, string>>(
    Object.fromEntries(columnas.map((c) => [c.key, codificarEnlace(c.enlace)]))
  );
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    const enlaces = Object.fromEntries(columnas.map((c) => [c.key, decodificarEnlace(seleccion[c.key] ?? "")]));
    const res = await fetch(`/api/datasets/${datasetId}/enlaces`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enlaces }),
    });
    const body = await res.json();
    setGuardando(false);
    if (!res.ok) return setMensaje({ tipo: "error", texto: body.error ?? "No se pudieron guardar los enlaces" });
    setMensaje({ tipo: "ok", texto: "Enlaces guardados." });
    await onGuardado();
  }

  return (
    <details className="tarjeta plegable">
      <summary>Enlazar con otras tablas</summary>
      <div className="plegable-cuerpo">
        {opciones.length === 0 ? (
          <p className="suave" style={{ margin: 0 }}>
            Para enlazar necesitas al menos otra tabla. Sube otro Excel y vuelve aquí.
          </p>
        ) : (
          <>
            <p className="suave pequeno">
              Si enlazas una columna (por ejemplo <strong>Cliente</strong>) con otra tabla (por ejemplo{" "}
              <strong>Clientes &gt; Nombre</strong>), al agregar registros solo se aceptan valores que existan
              allí, y podrás saltar de una tabla a la otra.
            </p>
            <div>
              {columnas.map((c) => (
                <div key={c.key} className="fila-columna" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }}>
                  <strong>{c.label}</strong>
                  <select
                    aria-label={`Enlazar la columna ${c.label} con`}
                    value={seleccion[c.key] ?? ""}
                    onChange={(e) => setSeleccion((s) => ({ ...s, [c.key]: e.target.value }))}
                  >
                    <option value="">Sin enlace</option>
                    {opciones.map((o) => (
                      <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {mensaje && (
              <p className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status" style={{ marginTop: 14 }}>
                {mensaje.texto}
              </p>
            )}
            <button type="button" className="btn btn-primario" style={{ marginTop: 14 }} onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar enlaces"}
            </button>
            <p className="ayuda">Solo el dueño o un administrador puede cambiar los enlaces.</p>
          </>
        )}
      </div>
    </details>
  );
}
