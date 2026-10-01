// Reportes prehechos: sin que el usuario configure nada, a partir de los roles que ya
// marcó (monto, fecha, producto, cliente) armamos vistas fijas. Funciones puras, sin
// base de datos ni reloj propio, para poder probarlas (mismo patrón que seguimiento.ts).
import { fechaUTC } from "./seguimiento.ts";

interface FilaMonto {
  f?: string | null; // fecha
  m?: string | number | null; // monto
}

export interface TotalMes {
  mes: string; // "2026-09"
  total: number;
  registros: number;
}

function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Suma de montos por mes calendario, ordenado del más antiguo al más reciente.
// Ignora filas sin fecha o monto válidos. `meses`: cuántos meses recientes mostrar como máximo.
export function totalesPorMes(filas: FilaMonto[], ahora: Date, meses = 6): TotalMes[] {
  const porMes = new Map<string, { total: number; registros: number }>();
  for (const fila of filas) {
    const t = fechaUTC(fila.f);
    const monto = aNumero(fila.m);
    if (t === null || monto === null) continue;
    const d = new Date(t);
    const clave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const actual = porMes.get(clave) ?? { total: 0, registros: 0 };
    actual.total += monto;
    actual.registros++;
    porMes.set(clave, actual);
  }

  // Genera los últimos `meses` meses calendario (hasta el mes de "ahora"), aunque
  // algunos queden en cero: así la vista siempre muestra el mismo rango, no solo
  // los meses con datos.
  const resultado: TotalMes[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - i, 1));
    const clave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const v = porMes.get(clave);
    resultado.push({ mes: clave, total: Math.round((v?.total ?? 0) * 100) / 100, registros: v?.registros ?? 0 });
  }
  return resultado;
}

// Suma simple de un monto, sin agrupar por fecha ni producto: cubre el caso "caja"
// (ingresos/egresos por concepto, sin columna de fecha) donde totalesPorMes no aplica
// pero igual hay un monto que el usuario quiere ver sumado.
export function sumaMonto(filas: { m?: string | number | null }[]): number {
  const total = filas.reduce((s, f) => s + (aNumero(f.m) ?? 0), 0);
  return Math.round(total * 100) / 100;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export interface FlujoCaja {
  ventas: number;
  costos: number;
  igv: number;
  gananciaBruta: number; // ventas - costos, sin tocar el IGV
  gananciaNeta: number; // si incluyeIgv: gananciaBruta - igv (el IGV no es tuyo); si no, igual a la bruta
}

// Flujo de caja simple a partir de Monto (ventas) y Costo, ambos ya marcados por el
// usuario. El IGV depende de si las ventas cargadas ya lo incluyen o no -- no se puede
// adivinar, cada negocio carga sus montos distinto, así que lo decide el usuario por
// módulo (ver incluye_igv en datasets).
export function flujoCaja(filas: { m?: string | number | null; costo?: string | number | null }[], incluyeIgv: boolean): FlujoCaja {
  const ventas = sumaMonto(filas.map((f) => ({ m: f.m })));
  const costos = sumaMonto(filas.map((f) => ({ m: f.costo })));
  const igv = redondear(incluyeIgv ? ventas * (18 / 118) : ventas * 0.18);
  const gananciaBruta = redondear(ventas - costos);
  const gananciaNeta = incluyeIgv ? redondear(gananciaBruta - igv) : gananciaBruta;
  return { ventas, costos, igv, gananciaBruta, gananciaNeta };
}

export interface FilaAgrupable {
  clave?: string | null; // producto o cliente
  m?: string | number | null; // monto (opcional)
}

export interface RankingItem {
  clave: string;
  total: number; // suma de monto si había, si no queda en 0 y se ordena por veces
  veces: number;
}

// Agrupa por la clave (producto, cliente...) y ordena por monto sumado si hay montos,
// o por cantidad de apariciones si no. Devuelve el top `n`.
export function topPor(filas: FilaAgrupable[], n = 5): RankingItem[] {
  const porClave = new Map<string, { total: number; veces: number }>();
  let hayMontos = false;
  for (const fila of filas) {
    const clave = fila.clave?.toString().trim();
    if (!clave) continue;
    const actual = porClave.get(clave) ?? { total: 0, veces: 0 };
    const monto = aNumero(fila.m);
    if (monto !== null) { actual.total += monto; hayMontos = true; }
    actual.veces++;
    porClave.set(clave, actual);
  }
  const items = [...porClave.entries()].map(([clave, v]) => ({ clave, total: Math.round(v.total * 100) / 100, veces: v.veces }));
  items.sort((a, b) => (hayMontos ? b.total - a.total : b.veces - a.veces));
  return items.slice(0, n);
}
