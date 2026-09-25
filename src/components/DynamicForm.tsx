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
    await onSubmit(valores);
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
