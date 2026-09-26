"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Columna, TipoColumna } from "@/lib/excel-parser";
import { ROLES, type RolColumna } from "@/lib/roles";
import { enviarConfirmando } from "@/lib/confirmar";

interface Fila {
  key?: string; // sin key = campo nuevo
  label: string;
  tipo: TipoColumna;
  rol: RolColumna | "";
}

// Cambiar el nombre de la tabla, agregar/quitar/renombrar campos y eliminar la tabla.
// Los avisos sobre enlaces con otras tablas los devuelve el servidor (ver enviarConfirmando).
export default function EditarTabla({
  datasetId,
  nombre,
  columnas,
  onGuardado,
}: {
  datasetId: string;
  nombre: string;
  columnas: Columna[];
  onGuardado: () => Promise<void>;
}) {
  const router = useRouter();
  const desdeColumnas = () => columnas.map((c) => ({ key: c.key, label: c.label, tipo: c.tipo, rol: (c.rol ?? "") as Fila["rol"] }));
  const [nombreTabla, setNombreTabla] = useState(nombre);
  const [filas, setFilas] = useState<Fila[]>(desdeColumnas);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cambiar = (i: number, parche: Partial<Fila>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...parche } : x)));

  async function guardar() {
    setOcupado(true);
    setMensaje(null);
    const r = await enviarConfirmando(`/api/datasets/${datasetId}`, "PUT", {
      nombre: nombreTabla,
      columnas: filas.map((f) => ({ ...f, rol: f.rol || null })),
    });
    setOcupado(false);
    if (r.cancelado) return;
    if (!r.ok) return setMensaje({ tipo: "error", texto: r.body.error ?? "No se pudieron guardar los cambios" });
    setMensaje({ tipo: "ok", texto: "Cambios guardados." });
    await onGuardado();
    setFilas(r.body.columnas.map((c: Columna) => ({ key: c.key, label: c.label, tipo: c.tipo, rol: c.rol ?? "" })));
  }

  async function eliminar() {
    setOcupado(true);
    setMensaje(null);
    const r = await enviarConfirmando(`/api/datasets/${datasetId}`, "DELETE");
    if (r.ok) return router.push("/dashboard");
    setOcupado(false);
    if (!r.cancelado) setMensaje({ tipo: "error", texto: r.body.error ?? "No se pudo eliminar la tabla" });
  }

  return (
    <details className="tarjeta plegable">
      <summary>Editar tabla y campos</summary>
      <div className="plegable-cuerpo">
        <div className="campo">
          <label htmlFor="nombre-tabla">Nombre de la tabla</label>
          <input id="nombre-tabla" value={nombreTabla} onChange={(e) => setNombreTabla(e.target.value)} maxLength={120} />
        </div>

        <p className="suave pequeno">
          Puedes renombrar campos, cambiar qué significan, agregar campos nuevos o quitar los que no uses. Si un campo está
          enlazado con otra tabla, te avisamos antes de tocarlo.
        </p>

        {filas.map((f, i) => (
          <div key={f.key ?? `nuevo-${i}`} className="fila-columna" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1.2fr) auto" }}>
            <input aria-label={`Nombre del campo ${i + 1}`} value={f.label} maxLength={60} onChange={(e) => cambiar(i, { label: e.target.value })} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!f.key && (
                <select aria-label="Tipo del campo nuevo" value={f.tipo} onChange={(e) => cambiar(i, { tipo: e.target.value as TipoColumna })}>
                  <option value="texto">Texto</option>
                  <option value="numero">Número</option>
                  <option value="fecha">Fecha</option>
                </select>
              )}
              <select aria-label={`Qué significa ${f.label || "el campo"}`} value={f.rol} onChange={(e) => cambiar(i, { rol: e.target.value as Fila["rol"] })}>
                <option value="">Sin significado especial</option>
                {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-fantasma" onClick={() => setFilas((x) => x.filter((_, j) => j !== i))} disabled={filas.length === 1}>
              Quitar
            </button>
          </div>
        ))}

        <button type="button" className="btn btn-secundario" style={{ marginTop: 12 }} onClick={() => setFilas((f) => [...f, { label: "", tipo: "texto", rol: "" }])}>
          + Agregar campo
        </button>

        {mensaje && (
          <p className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status" style={{ marginTop: 14 }}>
            {mensaje.texto}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" className="btn btn-primario" onClick={guardar} disabled={ocupado}>
            {ocupado ? "Guardando..." : "Guardar cambios"}
          </button>
          <button type="button" className="btn btn-fantasma" onClick={eliminar} disabled={ocupado} style={{ color: "var(--error)" }}>
            Eliminar tabla
          </button>
        </div>
        <p className="ayuda">Solo el dueño o un administrador puede cambiar la estructura o eliminar tablas.</p>
      </div>
    </details>
  );
}
