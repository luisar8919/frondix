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
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 8, marginBottom: 24 }}>
      {columnas.map((c) => (
        <input
          key={c.key}
          type={inputType[c.tipo]}
          placeholder={c.label}
          value={valores[c.key] ?? ""}
          onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}
        />
      ))}
      <button type="submit" disabled={enviando}>{enviando ? "Guardando..." : "Agregar registro"}</button>
    </form>
  );
}
