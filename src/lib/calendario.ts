import { fechaUTC } from "./seguimiento.ts";

// Agrupa filas con fecha por día del mes -- lo que necesita cualquier vista tipo
// calendario (reservas, citas, lo que tenga una columna de Fecha). Funciones puras,
// sin base de datos, para poder probarlas.
export interface FilaCalendario {
  f?: string | null; // fecha (puede traer hora, ej. "2026-10-05T14:30:00.000Z")
  p?: string | null; // producto/servicio
  c?: string | null; // cliente
  m?: string | number | null; // monto
}

export interface EntradaDia {
  hora: string | null; // "HH:mm" si la fecha traía hora distinta de medianoche
  producto: string | null;
  cliente: string | null;
  monto: number | null;
}

function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// "2026-10-05T14:30:00.000Z" -> "14:30"; null si es medianoche (sin hora real) o no hay fecha.
function horaDe(iso: string): string | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  return m[1] === "00" && m[2] === "00" ? null : `${m[1]}:${m[2]}`;
}

// Entradas del mes (anio, mes 1-12), agrupadas por día (1-31), ordenadas por hora.
export function agruparPorDia(filas: FilaCalendario[], anio: number, mes: number): Map<number, EntradaDia[]> {
  const resultado = new Map<number, EntradaDia[]>();
  for (const fila of filas) {
    if (typeof fila.f !== "string") continue;
    const ms = fechaUTC(fila.f);
    if (ms === null) continue;
    const d = new Date(ms);
    if (d.getUTCFullYear() !== anio || d.getUTCMonth() + 1 !== mes) continue;

    const dia = d.getUTCDate();
    const lista = resultado.get(dia) ?? [];
    lista.push({
      hora: horaDe(fila.f),
      producto: fila.p?.toString().trim() || null,
      cliente: fila.c?.toString().trim() || null,
      monto: aNumero(fila.m),
    });
    resultado.set(dia, lista);
  }
  for (const lista of resultado.values()) {
    lista.sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
  }
  return resultado;
}
