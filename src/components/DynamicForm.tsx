"use client";

import { useState } from "react";
import type { Columna } from "@/lib/excel-parser";

const inputType: Record<Columna["tipo"], string> = {
  texto: "text",
  numero: "number",
  fecha: "date",
};

export default function DynamicForm({
  columnas,
  opciones,
  etiquetasEnlace,
  onSubmit,
}: {
  columnas: Columna[];
  // valores permitidos por columna enlazada (autocompletado)
  opciones?: Record<string, string[]>;
  // a qué tabla > columna apunta cada columna enlazada (texto de ayuda)
  etiquetasEnlace?: Record<string, string>;
  // devuelve un mensaje de error si el servidor rechazó el registro, o null si se guardó
  onSubmit: (data: Record<string, unknown>) => Promise<string | null>;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    // Guardar con el mismo tipo que los datos importados (numero, fecha ISO), no como texto.
    const datos: Record<string, unknown> = {};
    for (const c of columnas) {
      const v = valores[c.key];
      if (v === undefined || v === "") datos[c.key] = null;
      else if (c.tipo === "numero") datos[c.key] = Number(v);
      else if (c.tipo === "fecha") datos[c.key] = `${v}T00:00:00.000Z`;
      else datos[c.key] = v;
    }
    const fallo = await onSubmit(datos);
    setEnviando(false);
    if (fallo) return setError(fallo);
    setError(null);
    setValores({});
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grilla-form">
        {columnas.map((c) => {
          const enlazada = !!c.enlace;
          return (
            <div key={c.key}>
              <label htmlFor={`campo-${c.key}`}>{c.label}</label>
              <input
                id={`campo-${c.key}`}
                type={enlazada ? "text" : inputType[c.tipo]}
                step={c.tipo === "numero" && !enlazada ? "any" : undefined}
                inputMode={c.tipo === "numero" && !enlazada ? "decimal" : undefined}
                list={enlazada ? `lista-${c.key}` : undefined}
                autoComplete={enlazada ? "off" : undefined}
                value={valores[c.key] ?? ""}
                onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}
              />
              {enlazada && (
                <>
                  <datalist id={`lista-${c.key}`}>
                    {(opciones?.[c.key] ?? []).map((v) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                  <p className="ayuda">Enlazada con {etiquetasEnlace?.[c.key] ?? "otra tabla"}</p>
                </>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="alerta alerta-error" role="alert" style={{ marginTop: 14, marginBottom: 0 }}>{error}</p>}
      <button type="submit" className="btn btn-primario" style={{ marginTop: 18 }} disabled={enviando}>
        {enviando ? "Guardando..." : "Agregar registro"}
      </button>
    </form>
  );
}
