"use client";

import { useState } from "react";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";

interface TablaCreada {
  datasetId: string;
  nombre: string;
  hojas: string[];
  filasImportadas: number;
}

export default function UploadAutoPage() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ tablas: TablaCreada[]; hojasOmitidas: string[] } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) return;
    setCargando(true);
    setError(null);
    setResultado(null);

    const supabase = crearClienteBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: miembro } = await supabase
      .from("miembros")
      .select("empresa_id")
      .eq("user_id", user!.id)
      .single();

    const form = new FormData();
    form.append("archivo", archivo);
    form.append("empresaId", miembro!.empresa_id);

    const res = await fetch("/api/upload/auto", { method: "POST", body: form });
    const body = await res.json();
    setCargando(false);

    if (!res.ok) return setError(body.error ?? "Error procesando el archivo");
    setResultado(body);
  }

  return (
    <main style={{ maxWidth: 560, margin: "40px auto" }}>
      <h1>Generar tablas automáticamente</h1>
      <p style={{ color: "#666" }}>
        Si tu Excel tiene varias hojas (meses, caja, stock, etc.), agrupamos las que se parecen
        entre sí y creamos hasta 3 tablas de una — la que tenga más columnas de cada grupo define
        la estructura, el resto de las hojas del mismo grupo completan lo que les falte.
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 24 }}>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
        <button type="submit" disabled={cargando}>{cargando ? "Procesando..." : "Generar tablas"}</button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>

      {resultado && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 18 }}>Se crearon {resultado.tablas.length} tabla(s)</h2>
          <ul>
            {resultado.tablas.map((t) => (
              <li key={t.datasetId} style={{ marginBottom: 8 }}>
                <Link href={`/dashboard/${t.datasetId}`}><strong>{t.nombre}</strong></Link>
                {" — "}{t.filasImportadas} filas, de la(s) hoja(s): {t.hojas.join(", ")}
              </li>
            ))}
          </ul>
          {resultado.hojasOmitidas.length > 0 && (
            <p style={{ color: "#a66", fontSize: 14 }}>
              No se importaron (más de 3 estructuras distintas en el archivo, quedaron afuera las con
              menos datos): {resultado.hojasOmitidas.join(", ")}. Podés importarlas a mano desde{" "}
              <Link href="/dashboard/upload">Subir Excel</Link>.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
