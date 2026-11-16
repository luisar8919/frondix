"use client";

import { useMemo, useState } from "react";
import type { Columna } from "@/lib/excel-parser";
import { liberaElHorario } from "@/lib/agenda";

interface Registro {
  id: string;
  data: Record<string, unknown>;
}

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function claveDia(valor: unknown): string | null {
  if (!valor) return null;
  const d = new Date(String(valor));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Calendario mensual para módulos "de agenda" (ver esAgenda en lib/agenda.ts):
// agrupa las filas por día (columna con rol "fecha") y, al tocar un día, lista
// las citas de esa fecha ordenadas por hora. Ningún dato nuevo -- lee las
// mismas filas que ya trae DynamicTable, solo las agrupa distinto.
export default function CalendarioAgenda({ columnas, registros }: { columnas: Columna[]; registros: Registro[] }) {
  const cFecha = columnas.find((c) => c.rol === "fecha");
  const cEstado = columnas.find((c) => c.rol === "estado");
  const cCliente = columnas.find((c) => c.rol === "cliente") ?? columnas.find((c) => c.key === "cliente");
  const cServicio = columnas.find((c) => c.rol === "producto");

  const hoy = new Date();
  const [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [diaElegido, setDiaElegido] = useState<string | null>(claveDia(hoy));

  const porDia = useMemo(() => {
    const mapa = new Map<string, Registro[]>();
    if (!cFecha) return mapa;
    for (const r of registros) {
      const clave = claveDia(r.data[cFecha.key]);
      if (!clave) continue;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(r);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => String(a.data.hora ?? "").localeCompare(String(b.data.hora ?? "")));
    }
    return mapa;
  }, [registros, cFecha]);

  if (!cFecha) return null;

  const primerDiaMes = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const diasEnMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas: (string | null)[] = Array(primerDiaMes.getDay()).fill(null);
  for (let d = 1; d <= diasEnMes; d++) {
    celdas.push(`${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  const citasDelDia = diaElegido ? (porDia.get(diaElegido) ?? []) : [];
  const claveHoy = claveDia(hoy);

  return (
    <details className="tarjeta plegable" open>
      <summary>Calendario</summary>
      <div className="plegable-cuerpo">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button type="button" className="btn btn-fantasma" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>
            &larr;
          </button>
          <strong>{mes.toLocaleDateString("es-PE", { month: "long", year: "numeric" })}</strong>
          <button type="button" className="btn btn-fantasma" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>
            &rarr;
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 13 }}>
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="suave pequeno" style={{ textAlign: "center", fontWeight: 600 }}>{d}</div>
          ))}
          {celdas.map((clave, i) => {
            if (!clave) return <div key={i} />;
            const citas = porDia.get(clave) ?? [];
            const ocupadas = citas.filter((c) => !liberaElHorario(cEstado ? c.data[cEstado.key] : undefined)).length;
            return (
              <button
                key={clave}
                type="button"
                onClick={() => setDiaElegido(clave)}
                style={{
                  minHeight: 54,
                  padding: 4,
                  borderRadius: 8,
                  border: clave === claveHoy ? "2px solid var(--verde-500, #2e8b57)" : "1px solid var(--borde, #ddd)",
                  background: clave === diaElegido ? "var(--verde-50, #eafaf1)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <span>{Number(clave.slice(8, 10))}</span>
                {ocupadas > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--verde-600, #1f6f45)" }}>{ocupadas}</span>
                )}
              </button>
            );
          })}
        </div>

        {diaElegido && (
          <div style={{ marginTop: 14 }}>
            <strong className="pequeno">
              {new Date(diaElegido + "T00:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
            </strong>
            {citasDelDia.length === 0 && <p className="suave pequeno" style={{ marginTop: 6 }}>Sin citas este día.</p>}
            {citasDelDia.map((c) => {
              const estadoVal = cEstado ? String(c.data[cEstado.key] ?? "") : "";
              const liberada = liberaElHorario(estadoVal);
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "baseline",
                    padding: "6px 0",
                    borderBottom: "1px solid var(--borde, #eee)",
                    opacity: liberada ? 0.55 : 1,
                  }}
                >
                  <span style={{ fontWeight: 700, minWidth: 48 }}>{String(c.data.hora ?? "--:--")}</span>
                  <span style={{ flex: 1 }}>
                    {cCliente ? String(c.data[cCliente.key] ?? "") : ""}
                    {cServicio ? ` — ${String(c.data[cServicio.key] ?? "")}` : ""}
                  </span>
                  {estadoVal && (
                    <span className="pequeno suave" style={{ textDecoration: liberada ? "line-through" : "none" }}>{estadoVal}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
