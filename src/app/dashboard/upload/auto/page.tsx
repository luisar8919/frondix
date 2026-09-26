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
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Generar tablas automáticamente</h1>
          <p className="suave" style={{ maxWidth: "62ch" }}>
            Si tu Excel tiene varias hojas (meses, caja, stock...), agrupamos las que se parecen y creamos
            hasta 3 tablas de una vez. En cada grupo manda la hoja con más columnas y las demás completan
            lo que les falte.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="tarjeta" style={{ maxWidth: 760 }}>
        <label htmlFor="archivo-auto">Tu archivo de Excel</label>
        <input id="archivo-auto" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
        {error && <p className="alerta alerta-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
        <button type="submit" className="btn btn-primario btn-grande" style={{ marginTop: 16 }} disabled={cargando || !archivo}>
          {cargando ? "Procesando..." : "Generar tablas"}
        </button>
      </form>

      {resultado && (
        <div className="tarjeta tarjeta-elevada" style={{ maxWidth: 760, marginTop: 20 }}>
          <h2 style={{ fontSize: 22 }}>
            Listo: se {resultado.tablas.length === 1 ? "creó 1 tabla" : `crearon ${resultado.tablas.length} tablas`}
          </h2>
          <div className="grilla-tablas" style={{ marginTop: 14 }}>
            {resultado.tablas.map((t) => (
              <Link key={t.datasetId} href={`/dashboard/${t.datasetId}`} className="tarjeta tarjeta-tabla">
                <h3>{t.nombre}</h3>
                <p className="suave pequeno" style={{ margin: 0 }}>
                  {t.filasImportadas} filas, de: {t.hojas.join(", ")}
                </p>
              </Link>
            ))}
          </div>
          {resultado.hojasOmitidas.length > 0 && (
            <p className="alerta alerta-aviso" style={{ marginTop: 16, marginBottom: 0 }}>
              No se importaron (había más de 3 estructuras distintas y quedaron afuera las de menos datos):{" "}
              {resultado.hojasOmitidas.join(", ")}. Puedes importarlas a mano desde{" "}
              <Link href="/dashboard/upload">Subir Excel</Link>.
            </p>
          )}
        </div>
      )}
    </>
  );
}
