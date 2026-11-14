"use client";

import { useState } from "react";
import type { Columna } from "@/lib/excel-parser";
import type { Regla } from "@/lib/reglas";
import { RECETAS, aplicarReceta, type Receta } from "@/lib/recetas";
import { enviarConfirmando } from "@/lib/confirmar";

// Galería de "recetas": reglas pre-armadas en lenguaje simple (ícono + frase +
// a lo sumo un valor), para quien no quiere ver Campo/Operador/Acción -- ver
// el comentario largo en recetas.ts. Se muestra ARRIBA de ReglasModulo (que
// queda como "modo avanzado", ya colapsado por defecto) en /dashboard/reglas.
// Guarda con el mismo PUT /api/datasets/[id] que ya usa ReglasModulo; avisa
// al padre (`onGuardado`) para que ambos componentes del mismo módulo queden
// sincronizados con la fila real (ver comentario en la page).
export default function RecetasModulo({
  datasetId,
  nombre,
  columnas,
  reglas,
  onGuardado,
}: {
  datasetId: string;
  nombre: string;
  columnas: Columna[];
  reglas: Regla[];
  onGuardado: (reglas: Regla[]) => void;
}) {
  const aplicables = RECETAS.filter((rc) => rc.aplicaA(columnas, nombre));
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  if (aplicables.length === 0) return null;

  async function aplicar(rc: Receta, activar: boolean) {
    setOcupada(rc.clave);
    setMensaje(null);
    const existente = reglas.find((r) => rc.coincideCon(r, columnas));
    const valor = borradores[rc.clave] ?? (existente ? rc.extraerValor(existente) : rc.valorPorDefecto);
    const nuevas = aplicarReceta(reglas, rc, columnas, valor, activar);
    const r = await enviarConfirmando(`/api/datasets/${datasetId}`, "PUT", { reglas: nuevas });
    setOcupada(null);
    if (r.cancelado) return;
    if (!r.ok) return setMensaje({ tipo: "error", texto: r.body.error ?? "No se pudo guardar" });
    onGuardado(r.body.reglas ?? nuevas);
  }

  return (
    <div className="tarjeta" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>{nombre}</h3>
      <p className="suave pequeno" style={{ marginTop: 0 }}>Recetas listas para activar, sin configurar nada técnico.</p>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", marginTop: 14 }}>
        {aplicables.map((rc) => {
          const existente = reglas.find((r) => rc.coincideCon(r, columnas));
          const activa = !!existente?.activa;
          const valorActual = borradores[rc.clave] ?? (existente ? rc.extraerValor(existente) : rc.valorPorDefecto);
          const opciones = rc.opcionesValor?.(columnas) ?? null;
          const trabajando = ocupada === rc.clave;

          return (
            <div
              key={rc.clave}
              style={{
                border: `1px solid ${activa ? "var(--verde-200)" : "var(--linea)"}`,
                background: activa ? "var(--verde-50)" : "var(--papel)",
                borderRadius: 10,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{rc.icono}</span>
                <strong style={{ flex: 1 }}>{rc.titulo}</strong>
                {activa && <span className="insignia">Activa</span>}
              </div>

              <p className="suave pequeno" style={{ margin: "8px 0 10px" }}>{rc.descripcion(valorActual || rc.valorPorDefecto)}</p>

              {rc.tipoValor !== "ninguno" && (
                opciones?.length ? (
                  <select
                    aria-label={rc.titulo}
                    value={valorActual}
                    onChange={(e) => setBorradores((b) => ({ ...b, [rc.clave]: e.target.value }))}
                    style={{ width: "100%", marginBottom: 10 }}
                  >
                    {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    aria-label={rc.titulo}
                    type={rc.tipoValor === "numero" ? "number" : "text"}
                    value={valorActual}
                    onChange={(e) => setBorradores((b) => ({ ...b, [rc.clave]: e.target.value }))}
                    style={{ width: "100%", marginBottom: 10 }}
                  />
                )
              )}

              <div style={{ display: "flex", gap: 8 }}>
                {activa ? (
                  <>
                    {rc.tipoValor !== "ninguno" && (
                      <button type="button" className="btn btn-secundario" disabled={trabajando} onClick={() => aplicar(rc, true)}>
                        Actualizar
                      </button>
                    )}
                    <button type="button" className="btn btn-fantasma" disabled={trabajando} onClick={() => aplicar(rc, false)}>
                      Desactivar
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primario" disabled={trabajando} onClick={() => aplicar(rc, true)}>
                    {trabajando ? "Activando..." : "Activar"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {mensaje && <p className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status" style={{ marginTop: 14 }}>{mensaje.texto}</p>}
    </div>
  );
}
