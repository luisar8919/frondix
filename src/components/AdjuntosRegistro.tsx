"use client";

import { useEffect, useState } from "react";

interface Adjunto {
  id: string;
  nombre: string;
  tipo: string | null;
  tamano: number | null;
  subidoPor: string | null;
  creadoEn: string;
  url: string | null;
}

function kb(bytes: number | null): string {
  if (!bytes) return "";
  return `${Math.round(bytes / 1024)} KB`;
}

// Archivos sueltos (foto de boleta, contrato, radiografía, plano...) colgados
// de un registro cualquiera -- bucket privado, todo pasa por /api/adjuntos
// (nunca Storage directo desde acá). Se muestra dentro de "Editar registro",
// solo tiene sentido una vez que el registro ya existe (tiene id real).
export default function AdjuntosRegistro({ datasetId, recordId }: { datasetId: string; recordId: string }) {
  const [adjuntos, setAdjuntos] = useState<Adjunto[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  function cargar() {
    fetch(`/api/adjuntos?recordId=${recordId}`)
      .then((res) => res.json())
      .then((body) => setAdjuntos(body.adjuntos ?? []))
      .catch(() => setAdjuntos([]));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo después
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) return setError("El archivo pesa más de 5 MB.");
    setSubiendo(true);
    setError("");
    const lector = new FileReader();
    lector.onload = async () => {
      const res = await fetch("/api/adjuntos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, recordId, archivo: lector.result, nombre: archivo.name }),
      });
      setSubiendo(false);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return setError(body.error ?? "No se pudo subir el archivo");
      }
      cargar();
    };
    lector.onerror = () => { setSubiendo(false); setError("No se pudo leer el archivo"); };
    lector.readAsDataURL(archivo);
  }

  async function borrar(id: string) {
    if (!window.confirm("¿Borrar este archivo? No se puede deshacer.")) return;
    const res = await fetch(`/api/adjuntos/${id}`, { method: "DELETE" });
    if (res.ok) setAdjuntos((as) => (as ?? []).filter((a) => a.id !== id));
  }

  return (
    <div className="tarjeta" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>Archivos adjuntos</h3>
      <label className="btn btn-secundario" style={{ display: "inline-block", cursor: "pointer" }}>
        {subiendo ? "Subiendo..." : "+ Adjuntar archivo"}
        <input type="file" onChange={subir} disabled={subiendo} style={{ display: "none" }} />
      </label>
      <p className="ayuda" style={{ marginTop: 6 }}>Fotos, PDF, lo que necesites guardar con este registro. Máximo 5 MB.</p>
      {error && <p className="alerta alerta-error pequeno" role="alert">{error}</p>}

      {adjuntos === null && <p className="suave pequeno">Cargando...</p>}
      {adjuntos?.length === 0 && <p className="suave pequeno">Todavía no hay archivos acá.</p>}
      {adjuntos?.map((a) => (
        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--linea)" }}>
          <div>
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer">{a.nombre}</a>
            ) : (
              <span>{a.nombre}</span>
            )}
            <p className="suave pequeno" style={{ margin: "2px 0 0" }}>{kb(a.tamano)} -- {a.subidoPor ?? ""}</p>
          </div>
          <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={() => borrar(a.id)}>
            Borrar
          </button>
        </div>
      ))}
    </div>
  );
}
