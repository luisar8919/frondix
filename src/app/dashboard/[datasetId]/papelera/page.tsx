"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { enviarConfirmando } from "@/lib/confirmar";
import type { Columna } from "@/lib/excel-parser";

interface Registro {
  id: string;
  data: Record<string, unknown>;
  eliminado_en?: string | null;
}

// Registros eliminados de este módulo (ver migracion-33-papelera.sql): el
// DELETE normal de /api/records ya no borra de verdad, solo marca
// `eliminado_en` -- acá se pueden restaurar o borrar para siempre. Reusa el
// mismo GET de siempre con ?papelera=1 en vez de un endpoint nuevo.
export default function PapeleraPage({ params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = usePromise(params);
  const [nombre, setNombre] = useState("");
  const [columnas, setColumnas] = useState<Columna[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  function cargar() {
    setCargando(true);
    fetch(`/api/records/${datasetId}?papelera=1`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar la papelera");
        setNombre(body.dataset?.nombre ?? "");
        setColumnas(body.dataset?.columnas ?? []);
        setRegistros(body.records ?? []);
      })
      .catch(() => setError("No se pudo conectar con el servidor."))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, [datasetId]);

  async function restaurar(id: string) {
    setOcupado(id);
    try {
      const res = await fetch(`/api/records/${datasetId}/${id}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "No se pudo restaurar"); return; }
      setRegistros((rs) => rs.filter((x) => x.id !== id));
    } finally {
      setOcupado(null);
    }
  }

  async function eliminarDefinitivo(id: string) {
    if (!window.confirm("Esto borra el registro para siempre, sin poder deshacerlo. ¿Continuar?")) return;
    setOcupado(id);
    const r = await enviarConfirmando(`/api/records/${datasetId}/${id}`, "DELETE", { definitivo: true });
    setOcupado(null);
    if (r.cancelado) return;
    if (!r.ok) return setError(r.body.error ?? "No se pudo eliminar");
    setRegistros((rs) => rs.filter((x) => x.id !== id));
  }

  const columnasVisibles = columnas.slice(0, 4);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <Link href={`/dashboard/${datasetId}`} className="migas">&larr; {nombre || "Volver"}</Link>
          <h1>Papelera</h1>
          <p className="suave">Registros eliminados de {nombre || "este módulo"} -- se pueden restaurar o borrar para siempre.</p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {cargando && <p className="suave">Cargando...</p>}

      {!cargando && registros.length === 0 && !error && (
        <div className="tarjeta">
          <p className="suave">La papelera está vacía.</p>
        </div>
      )}

      {registros.map((r) => (
        <div key={r.id} className="tarjeta" style={{ marginBottom: 12, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            {columnasVisibles.map((c) => (
              <span key={c.key} className="pequeno" style={{ marginRight: 16 }}>
                <strong>{c.label}:</strong> {String(r.data[c.key] ?? "")}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secundario" disabled={ocupado === r.id} onClick={() => restaurar(r.id)}>
              Restaurar
            </button>
            <button type="button" className="btn btn-fantasma" disabled={ocupado === r.id} onClick={() => eliminarDefinitivo(r.id)}>
              Eliminar para siempre
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
