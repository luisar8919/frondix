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
  onSubmit,
}: {
  columnas: Columna[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

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
    await onSubmit(datos);
    setValores({});
    setEnviando(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grilla-form">
        {columnas.map((c) => (
          <div key={c.key}>
            <label htmlFor={`campo-${c.key}`}>{c.label}</label>
            <input
              id={`campo-${c.key}`}
              type={inputType[c.tipo]}
              step={c.tipo === "numero" ? "any" : undefined}
              inputMode={c.tipo === "numero" ? "decimal" : undefined}
              value={valores[c.key] ?? ""}
              onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <button type="submit" className="btn btn-primario" style={{ marginTop: 18 }} disabled={enviando}>
        {enviando ? "Guardando..." : "Agregar registro"}
      </button>
    </form>
  );
}
