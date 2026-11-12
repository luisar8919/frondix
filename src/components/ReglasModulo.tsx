"use client";

import { useState } from "react";
import type { Columna } from "@/lib/excel-parser";
import type { Regla } from "@/lib/reglas";
import { enviarConfirmando } from "@/lib/confirmar";

// Las reglas (condición -> acción) de UN módulo, como su propia tarjeta --
// extraído de EditarTabla (donde vivían escondidas dentro de "Editar módulo y
// campos") para que tengan su propio lugar visible: la pantalla /dashboard/reglas,
// que lista una tarjeta de estas por cada módulo con algo que mostrar (mismo
// criterio de la API /api/reglas). El guardado reusa el mismo PUT
// /api/datasets/[id] que ya usa EditarTabla -- mandando solo `reglas`, sin
// tocar columnas/nombre (el servidor conserva lo que no se manda).
export default function ReglasModulo({
  datasetId,
  nombre,
  columnas,
  reglas,
}: {
  datasetId: string;
  nombre: string;
  columnas: Columna[];
  reglas: Regla[];
}) {
  const [reglasLocal, setReglasLocal] = useState<Regla[]>(reglas);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cambiarRegla = (i: number, parche: Partial<Regla>) => setReglasLocal((rs) => rs.map((r, j) => (j === i ? ({ ...r, ...parche } as Regla) : r)));

  const columnasEstado = columnas.filter((c) => c.rol === "estado");
  const opcionesDe = (columnaKey: string) => columnasEstado.find((c) => c.key === columnaKey)?.opcionesFijas ?? [];

  function agregarRegla() {
    const primera = columnasEstado[0];
    if (!primera) return;
    setReglasLocal((rs) => [
      ...rs,
      {
        id: crypto.randomUUID(),
        activa: true,
        origen: "manual",
        condicion: { tipo: "estado", columnaKey: primera.key, valor: (primera.opcionesFijas ?? [])[0] ?? "" },
        accion: { tipo: "excluir_de_reportes" },
      },
    ]);
  }

  async function guardar() {
    setOcupado(true);
    setMensaje(null);
    const r = await enviarConfirmando(`/api/datasets/${datasetId}`, "PUT", { reglas: reglasLocal });
    setOcupado(false);
    if (r.cancelado) return;
    if (!r.ok) return setMensaje({ tipo: "error", texto: r.body.error ?? "No se pudieron guardar los cambios" });
    setMensaje({ tipo: "ok", texto: "Guardado." });
    setReglasLocal(r.body.reglas ?? reglasLocal);
  }

  return (
    <div className="tarjeta" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0 }}>{nombre}</h3>

      {reglasLocal.length === 0 && (
        <p className="suave pequeno" style={{ marginTop: 10 }}>Este módulo todavía no tiene ninguna regla.</p>
      )}

      {reglasLocal.map((r, i) => (
        <div key={r.id} className="fila-columna" style={{ gridTemplateColumns: "1fr auto", alignItems: "start", marginTop: 14 }}>
          {r.accion.tipo === "ajustar_stock" ? (
            <div>
              <strong style={{ fontSize: 14 }}>Ajustar Stock automáticamente</strong>
              <p className="ayuda" style={{ margin: "2px 0 0" }}>Cada venta o compra de este módulo suma o resta del Stock enlazado.</p>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="suave pequeno">Campo</span>
              <select
                aria-label="Campo de la condición"
                value={r.condicion.tipo === "estado" ? r.condicion.columnaKey : ""}
                onChange={(e) => cambiarRegla(i, { condicion: { tipo: "estado", columnaKey: e.target.value, valor: opcionesDe(e.target.value)[0] ?? "" } })}
              >
                {columnasEstado.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <span className="suave pequeno">=</span>
              <select
                aria-label="Valor de la condición"
                value={r.condicion.tipo === "estado" ? r.condicion.valor : ""}
                onChange={(e) => {
                  const columnaKey = r.condicion.tipo === "estado" ? r.condicion.columnaKey : columnasEstado[0]?.key ?? "";
                  cambiarRegla(i, { condicion: { tipo: "estado", columnaKey, valor: e.target.value } });
                }}
              >
                {opcionesDe(r.condicion.tipo === "estado" ? r.condicion.columnaKey : "").map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <span className="suave pequeno">Acción</span>
              <select
                aria-label="Acción"
                value={r.accion.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as "excluir_de_reportes" | "cambiar_estado";
                  const columnaKey = r.condicion.tipo === "estado" ? r.condicion.columnaKey : columnasEstado[0]?.key ?? "";
                  cambiarRegla(i, { accion: tipo === "excluir_de_reportes" ? { tipo } : { tipo, columnaKey, valor: opcionesDe(columnaKey)[0] ?? "" } });
                }}
              >
                <option value="excluir_de_reportes">Excluir de reportes</option>
                <option value="cambiar_estado">Cambiar Estado a...</option>
              </select>
              {r.accion.tipo === "cambiar_estado" && (
                <select
                  aria-label="Nuevo valor de Estado"
                  value={r.accion.valor}
                  onChange={(e) => cambiarRegla(i, { accion: { tipo: "cambiar_estado", columnaKey: (r.accion as { columnaKey: string }).columnaKey, valor: e.target.value } })}
                >
                  {opcionesDe((r.accion as { columnaKey: string }).columnaKey).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label className="pequeno" style={{ display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={r.activa} onChange={(e) => cambiarRegla(i, { activa: e.target.checked })} /> Activa
            </label>
            <button type="button" className="btn btn-fantasma" onClick={() => setReglasLocal((rs) => rs.filter((_, j) => j !== i))}>
              Quitar
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        {columnasEstado.length > 0 && (
          <button type="button" className="btn btn-secundario" onClick={agregarRegla}>
            + Agregar regla
          </button>
        )}
        <button type="button" className="btn btn-primario" onClick={guardar} disabled={ocupado}>
          {ocupado ? "Guardando..." : "Guardar cambios"}
        </button>
        {mensaje && <span className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status" style={{ margin: 0 }}>{mensaje.texto}</span>}
      </div>
    </div>
  );
}
