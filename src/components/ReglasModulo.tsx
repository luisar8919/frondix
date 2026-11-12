"use client";

import { useState } from "react";
import type { Columna } from "@/lib/excel-parser";
import { OPERADORES_NUMERO, OPERADORES_TEXTO, type Regla } from "@/lib/reglas";
import { enviarConfirmando } from "@/lib/confirmar";

// Las reglas (condición -> acción) de UN módulo, como su propia tarjeta --
// pantalla /dashboard/reglas, que lista una de estas por cada módulo con algo
// que mostrar (mismo criterio de la API /api/reglas). El guardado reusa el
// mismo PUT /api/datasets/[id] que ya usa EditarTabla -- mandando solo
// `reglas`, sin tocar columnas/nombre (el servidor conserva lo que no se manda).
//
// Modelo FFXII: el "detonante" (condición) puede ser CUALQUIER campo ya
// mapeado del módulo (no solo "Estado" -- Monto, Cantidad, Stock mínimo...),
// con el operador que corresponda a su tipo (igual/distinto para texto,
// también mayor/menor para número) -- mismo "umbral" que en el juego.
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

  // Cualquier campo con significado mapeado puede ser el detonante -- ya no
  // solo los de rol "estado". Los que tienen opcionesFijas muestran un
  // desplegable de valores; el resto, texto o número libre según su tipo.
  const columnasCondicion = columnas.filter((c) => c.rol !== null);
  const columnaDe = (key: string) => columnas.find((c) => c.key === key);
  const operadoresDe = (key: string) => (columnaDe(key)?.tipo === "numero" ? OPERADORES_NUMERO : OPERADORES_TEXTO);
  // Target de "cambiar_estado": cualquier campo de texto con lista cerrada (tiene sentido
  // "cambiar a" un valor fijo, no texto libre arbitrario).
  const columnasDestino = columnas.filter((c) => c.tipo === "texto" && (c.opcionesFijas?.length ?? 0) > 0);

  function agregarRegla() {
    const primera = columnasCondicion[0];
    if (!primera) return;
    setReglasLocal((rs) => [
      ...rs,
      {
        id: crypto.randomUUID(),
        activa: true,
        origen: "manual",
        condicion: { tipo: "campo", columnaKey: primera.key, operador: "es", valor: (primera.opcionesFijas ?? [])[0] ?? "" },
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

  // key/operador/valor de la condición de una regla, leyendo también el alias
  // legado "estado" (equivale a operador "es") para reglas guardadas antes de
  // esta generalización.
  function datosCondicion(r: Regla) {
    if (r.condicion.tipo === "campo") return { key: r.condicion.columnaKey, operador: r.condicion.operador, valor: r.condicion.valor };
    if (r.condicion.tipo === "estado") return { key: r.condicion.columnaKey, operador: "es" as const, valor: r.condicion.valor };
    return { key: "", operador: "es" as const, valor: "" };
  }

  function valorInput(key: string, valor: string, onChange: (v: string) => void, ariaLabel: string) {
    const col = columnaDe(key);
    if (col?.opcionesFijas?.length) {
      return (
        <select aria-label={ariaLabel} value={valor} onChange={(e) => onChange(e.target.value)}>
          {col.opcionesFijas.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    }
    return (
      <input
        aria-label={ariaLabel}
        type={col?.tipo === "numero" ? "number" : "text"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: col?.tipo === "numero" ? 100 : 140 }}
      />
    );
  }

  return (
    <div className="tarjeta" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0 }}>{nombre}</h3>

      {reglasLocal.length === 0 && (
        <p className="suave pequeno" style={{ marginTop: 10 }}>Este módulo todavía no tiene ninguna regla.</p>
      )}

      {reglasLocal.map((r, i) => {
        const cond = datosCondicion(r);
        return (
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
                  value={cond.key}
                  onChange={(e) => {
                    const key = e.target.value;
                    const operador = operadoresDe(key)[0].valor;
                    cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: key, operador, valor: columnaDe(key)?.opcionesFijas?.[0] ?? "" } });
                  }}
                >
                  {columnasCondicion.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select
                  aria-label="Operador"
                  value={cond.operador}
                  onChange={(e) => cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: cond.key, operador: e.target.value as typeof cond.operador, valor: cond.valor } })}
                >
                  {operadoresDe(cond.key).map((op) => <option key={op.valor} value={op.valor}>{op.etiqueta}</option>)}
                </select>
                {valorInput(cond.key, cond.valor, (v) => cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: cond.key, operador: cond.operador, valor: v } }), "Valor de la condición")}
                <span className="suave pequeno">Acción</span>
                <select
                  aria-label="Acción"
                  value={r.accion.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value as "excluir_de_reportes" | "cambiar_estado";
                    const columnaKey = columnasDestino[0]?.key ?? cond.key;
                    cambiarRegla(i, { accion: tipo === "excluir_de_reportes" ? { tipo } : { tipo, columnaKey, valor: columnaDe(columnaKey)?.opcionesFijas?.[0] ?? "" } });
                  }}
                >
                  <option value="excluir_de_reportes">Excluir de reportes</option>
                  {columnasDestino.length > 0 && <option value="cambiar_estado">Cambiar un campo a...</option>}
                </select>
                {r.accion.tipo === "cambiar_estado" && (
                  <>
                    <select
                      aria-label="Campo a cambiar"
                      value={r.accion.columnaKey}
                      onChange={(e) => cambiarRegla(i, { accion: { tipo: "cambiar_estado", columnaKey: e.target.value, valor: columnaDe(e.target.value)?.opcionesFijas?.[0] ?? "" } })}
                    >
                      {columnasDestino.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    {valorInput(r.accion.columnaKey, r.accion.valor, (v) => cambiarRegla(i, { accion: { tipo: "cambiar_estado", columnaKey: (r.accion as { columnaKey: string }).columnaKey, valor: v } }), "Nuevo valor")}
                  </>
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
        );
      })}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        {columnasCondicion.length > 0 && (
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
