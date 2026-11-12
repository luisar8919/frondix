"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Columna, TipoColumna } from "@/lib/excel-parser";
import { ROLES, type RolColumna } from "@/lib/roles";
import { enviarConfirmando } from "@/lib/confirmar";
import { MONEDAS } from "@/lib/moneda";
import type { Regla } from "@/lib/reglas";

interface Fila {
  key?: string; // sin key = campo nuevo
  label: string;
  tipo: TipoColumna;
  rol: RolColumna | "";
  // lista cerrada de valores para un campo tipo:"texto" (ver Columna.opcionesFijas) --
  // se puede editar en un campo YA EXISTENTE (a diferencia de tipo/rol), porque no
  // cambia la forma del dato guardado.
  opcionesFijas?: string[];
}

// Cambiar el nombre de la tabla, agregar/quitar/renombrar campos, armar reglas
// (condición -> acción, ver lib/reglas.ts) y eliminar la tabla. Los avisos sobre
// enlaces con otras tablas los devuelve el servidor (ver enviarConfirmando).
export default function EditarTabla({
  datasetId,
  nombre,
  columnas,
  incluyeIgv,
  moneda,
  reglas,
  onGuardado,
}: {
  datasetId: string;
  nombre: string;
  columnas: Columna[];
  incluyeIgv: boolean;
  moneda: string;
  reglas: Regla[];
  onGuardado: () => Promise<void>;
}) {
  const router = useRouter();
  const desdeColumnas = () =>
    columnas.map((c) => ({ key: c.key, label: c.label, tipo: c.tipo, rol: (c.rol ?? "") as Fila["rol"], opcionesFijas: c.opcionesFijas ?? undefined }));
  const [nombreTabla, setNombreTabla] = useState(nombre);
  const [filas, setFilas] = useState<Fila[]>(desdeColumnas);
  const [incluyeIgvLocal, setIncluyeIgvLocal] = useState(incluyeIgv);
  const [monedaLocal, setMonedaLocal] = useState(moneda);
  const [reglasLocal, setReglasLocal] = useState<Regla[]>(reglas);
  // Borrador de texto crudo del input de opciones mientras se tipea (separadas por
  // coma) -- se parsea a array recién al salir del campo. Si se parseara en cada
  // tecla, una coma+espacio recién tipeada desaparecía del campo apenas se filtraban
  // los segmentos vacíos, un parpadeo molesto para el usuario.
  const [opcionesBorrador, setOpcionesBorrador] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cambiar = (i: number, parche: Partial<Fila>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...parche } : x)));
  const cambiarRegla = (i: number, parche: Partial<Regla>) => setReglasLocal((rs) => rs.map((r, j) => (j === i ? ({ ...r, ...parche } as Regla) : r)));

  // Solo columnas YA GUARDADAS (con key) pueden ser condición de una regla -- un
  // campo nuevo todavía sin guardar no tiene una key estable a la que apuntar.
  const columnasEstadoGuardadas = filas.filter((f) => f.key && f.rol === "estado") as (Fila & { key: string })[];
  const opcionesDe = (columnaKey: string) => columnasEstadoGuardadas.find((c) => c.key === columnaKey)?.opcionesFijas ?? [];

  function agregarRegla() {
    const primera = columnasEstadoGuardadas[0];
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
    const r = await enviarConfirmando(`/api/datasets/${datasetId}`, "PUT", {
      nombre: nombreTabla,
      columnas: filas.map((f) => ({ ...f, rol: f.rol || null })),
      incluyeIgv: incluyeIgvLocal,
      moneda: monedaLocal,
      reglas: reglasLocal,
    });
    setOcupado(false);
    if (r.cancelado) return;
    if (!r.ok) return setMensaje({ tipo: "error", texto: r.body.error ?? "No se pudieron guardar los cambios" });
    setMensaje({ tipo: "ok", texto: "Cambios guardados." });
    await onGuardado();
    setFilas(r.body.columnas.map((c: Columna) => ({ key: c.key, label: c.label, tipo: c.tipo, rol: c.rol ?? "", opcionesFijas: c.opcionesFijas ?? undefined })));
    setReglasLocal(r.body.reglas ?? []);
    setOpcionesBorrador({});
  }

  async function eliminar() {
    setOcupado(true);
    setMensaje(null);
    const r = await enviarConfirmando(`/api/datasets/${datasetId}`, "DELETE");
    if (r.ok) return router.push("/dashboard");
    setOcupado(false);
    if (!r.cancelado) setMensaje({ tipo: "error", texto: r.body.error ?? "No se pudo eliminar el módulo" });
  }

  return (
    <details className="tarjeta plegable">
      <summary>Editar módulo y campos</summary>
      <div className="plegable-cuerpo">
        <div className="campo">
          <label htmlFor="nombre-tabla">Nombre del módulo</label>
          <input id="nombre-tabla" value={nombreTabla} onChange={(e) => setNombreTabla(e.target.value)} maxLength={120} />
        </div>

        <div className="campo campo-check">
          <label>
            <input type="checkbox" checked={incluyeIgvLocal} onChange={(e) => setIncluyeIgvLocal(e.target.checked)} />{" "}
            Los montos de venta de este módulo ya incluyen IGV (18%)
          </label>
          <p className="ayuda">Lo usa el reporte de flujo de caja para calcular el IGV y la ganancia neta correctamente. Si no sabes, déjalo sin marcar.</p>
        </div>

        <div className="campo" style={{ maxWidth: 220 }}>
          <label htmlFor="moneda-tabla">Moneda de este módulo</label>
          <select id="moneda-tabla" value={monedaLocal} onChange={(e) => setMonedaLocal(e.target.value)}>
            {MONEDAS.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
          </select>
          <p className="ayuda">No convierte entre monedas: si combinás módulos en soles y en dólares, los totales que suman varios módulos juntos (Balance, Cuentas por cobrar/pagar, Valorización) asumen que todo es la misma moneda.</p>
        </div>

        <p className="suave pequeno">
          Puedes renombrar campos, cambiar qué significan, agregar campos nuevos o quitar los que no uses. Si un campo está
          enlazado con otro módulo, te avisamos antes de tocarlo.
        </p>

        {filas.map((f, i) => (
          <div key={f.key ?? `nuevo-${i}`} style={{ marginBottom: 10 }}>
            <div className="fila-columna" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1.2fr) auto" }}>
              <input aria-label={`Nombre del campo ${i + 1}`} value={f.label} maxLength={60} onChange={(e) => cambiar(i, { label: e.target.value })} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!f.key && (
                  <select
                    aria-label="Tipo del campo nuevo"
                    value={f.tipo}
                    onChange={(e) => {
                      const tipo = e.target.value as TipoColumna;
                      // Si el campo nuevo es de tipo Fecha y no eligió otro significado, se lo sugerimos:
                      // es la causa más común de que Seguimiento no reconozca una tabla.
                      cambiar(i, { tipo, rol: tipo === "fecha" && !f.rol ? "fecha" : f.rol });
                    }}
                  >
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
            {f.tipo === "texto" && (
              <input
                aria-label={`Opciones fijas de ${f.label || "este campo"}`}
                placeholder="Opciones separadas por coma (ej. Pendiente, En proceso, Cancelado) -- vacío = texto libre"
                value={opcionesBorrador[i] ?? (f.opcionesFijas ?? []).join(", ")}
                onChange={(e) => setOpcionesBorrador((b) => ({ ...b, [i]: e.target.value }))}
                onBlur={(e) => {
                  cambiar(i, { opcionesFijas: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) });
                  setOpcionesBorrador((b) => { const n = { ...b }; delete n[i]; return n; });
                }}
                style={{ marginTop: 6, fontSize: 13 }}
              />
            )}
          </div>
        ))}

        <button type="button" className="btn btn-secundario" style={{ marginTop: 12 }} onClick={() => setFilas((f) => [...f, { label: "", tipo: "texto", rol: "" }])}>
          + Agregar campo
        </button>

        {(columnasEstadoGuardadas.length > 0 || reglasLocal.length > 0) && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--linea)" }}>
            <strong>Reglas</strong>
            <p className="ayuda" style={{ marginTop: 2, marginBottom: 12 }}>
              Qué debe pasar solo cuando algo cambia en este módulo -- ej. que un pedido "Cancelado" no cuente como ingreso.
            </p>

            {reglasLocal.map((r, i) => (
              <div key={r.id} className="fila-columna" style={{ gridTemplateColumns: "1fr auto", alignItems: "start", marginBottom: 10 }}>
                {r.accion.tipo === "ajustar_stock" ? (
                  <div>
                    <strong style={{ fontSize: 14 }}>Ajustar Stock automáticamente</strong>
                    <p className="ayuda" style={{ margin: "2px 0 0" }}>Cada venta o compra de este módulo suma o resta del Stock enlazado.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="suave pequeno">Si</span>
                    <select
                      aria-label="Campo de la condición"
                      value={r.condicion.tipo === "estado" ? r.condicion.columnaKey : ""}
                      onChange={(e) => cambiarRegla(i, { condicion: { tipo: "estado", columnaKey: e.target.value, valor: opcionesDe(e.target.value)[0] ?? "" } })}
                    >
                      {columnasEstadoGuardadas.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <span className="suave pequeno">=</span>
                    <select
                      aria-label="Valor de la condición"
                      value={r.condicion.tipo === "estado" ? r.condicion.valor : ""}
                      onChange={(e) => {
                        const columnaKey = r.condicion.tipo === "estado" ? r.condicion.columnaKey : columnasEstadoGuardadas[0]?.key ?? "";
                        cambiarRegla(i, { condicion: { tipo: "estado", columnaKey, valor: e.target.value } });
                      }}
                    >
                      {opcionesDe(r.condicion.tipo === "estado" ? r.condicion.columnaKey : "").map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <span className="suave pequeno">entonces</span>
                    <select
                      aria-label="Acción"
                      value={r.accion.tipo}
                      onChange={(e) => {
                        const tipo = e.target.value as "excluir_de_reportes" | "cambiar_estado";
                        const columnaKey = r.condicion.tipo === "estado" ? r.condicion.columnaKey : columnasEstadoGuardadas[0]?.key ?? "";
                        cambiarRegla(i, {
                          accion: tipo === "excluir_de_reportes" ? { tipo } : { tipo, columnaKey, valor: opcionesDe(columnaKey)[0] ?? "" },
                        });
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

            {columnasEstadoGuardadas.length > 0 && (
              <button type="button" className="btn btn-secundario" onClick={agregarRegla}>
                + Agregar regla
              </button>
            )}
          </div>
        )}

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
            Eliminar módulo
          </button>
        </div>
        <p className="ayuda">Solo el dueño o un administrador puede cambiar la estructura o eliminar módulos.</p>
      </div>
    </details>
  );
}
