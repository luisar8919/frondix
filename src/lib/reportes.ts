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

export function aNumero(v: unknown): number | null {
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

// Recién subido un Excel, los meses anteriores al primer dato real se ven como
// una fila de ceros sin sentido (nadie vendía "S/ 0" antes de existir el
// negocio en Frondix) -- se recortan. Si hay un mes con datos más atrás en la
// ventana, ESE queda como punto de partida (con los ceros intermedios o
// posteriores a él, que sí son información real: "este mes no hubo ventas").
// Si no hay ningún mes con datos, se deja el arreglo tal cual (nada que recortar).
export function recortarMesesSinDatos(meses: TotalMes[]): TotalMes[] {
  const primero = meses.findIndex((m) => m.registros > 0);
  return primero <= 0 ? meses : meses.slice(primero);
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

export interface RankingMargen {
  clave: string;
  ventas: number;
  costos: number;
  margen: number;
  veces: number;
}

// Igual que topPor, pero agrupa Venta Y Costo por clave (producto) y ordena por
// margen (ventas - costos) en vez de por venta sola -- el "producto más vendido"
// no siempre es el más rentable (ver Dashboard de margen, benchmark vs. Defontana).
// Solo tiene sentido en un módulo con Producto + Monto + Costo marcados.
export function topPorMargen(filas: { clave?: string | null; m?: string | number | null; costo?: string | number | null }[], n = 10): RankingMargen[] {
  const porClave = new Map<string, { ventas: number; costos: number; veces: number }>();
  for (const fila of filas) {
    const clave = fila.clave?.toString().trim();
    if (!clave) continue;
    const actual = porClave.get(clave) ?? { ventas: 0, costos: 0, veces: 0 };
    actual.ventas += aNumero(fila.m) ?? 0;
    actual.costos += aNumero(fila.costo) ?? 0;
    actual.veces++;
    porClave.set(clave, actual);
  }
  const items = [...porClave.entries()].map(([clave, v]) => ({
    clave,
    ventas: redondear(v.ventas),
    costos: redondear(v.costos),
    margen: redondear(v.ventas - v.costos),
    veces: v.veces,
  }));
  items.sort((a, b) => b.margen - a.margen);
  return items.slice(0, n);
}

export interface ProgresoMeta {
  producto: string;
  objetivo: number;
  vendidos: number;
  faltan: number;
  porcentaje: number; // 0-100, no pasa de 100 aunque ya se haya superado la meta
  alcanzada: boolean;
}

// Cuántas veces aparece cada producto (una fila = una venta) contra la meta que el
// usuario fijó para ese producto en ese módulo. No usa monto: "vender 50 de Mario Kart"
// cuenta unidades, no soles.
export function progresoMetas(
  filas: { clave?: string | null }[],
  metas: { producto: string; cantidadObjetivo: number }[]
): ProgresoMeta[] {
  const veces = new Map<string, number>();
  for (const fila of filas) {
    const clave = fila.clave?.toString().trim();
    if (!clave) continue;
    veces.set(clave, (veces.get(clave) ?? 0) + 1);
  }
  return metas.map((m) => {
    const vendidos = veces.get(m.producto) ?? 0;
    return {
      producto: m.producto,
      objetivo: m.cantidadObjetivo,
      vendidos,
      faltan: Math.max(0, m.cantidadObjetivo - vendidos),
      porcentaje: Math.min(100, Math.round((vendidos / m.cantidadObjetivo) * 100)),
      alcanzada: vendidos >= m.cantidadObjetivo,
    };
  });
}

export interface PromedioDiarioProducto {
  clave: string;
  totalUnidades: number;
  promedioDiario: number; // totalUnidades / diasConDatos del módulo entero (no solo los días que SE vendió este producto)
}

// Cuánto vendés de cada producto en un día típico -- `diasConDatos` es la
// cantidad de fechas CALENDARIO distintas que trae el módulo entero (todos los
// productos juntos, lo calcula el caller con fechasDistintas() sobre las
// mismas filas), para que el promedio sea "por día de negocio abierto", no
// solo por los días en que ESE producto puntual se vendió (eso sobreestimaría
// productos de baja rotación). Sin columna "Cantidad" marcada, cada fila cuenta
// como 1 unidad (una venta = un producto).
export function promedioDiarioPorProducto(
  filas: { clave?: string | null; cantidad?: string | number | null }[],
  diasConDatos: number,
  n = 10
): PromedioDiarioProducto[] {
  if (diasConDatos <= 0) return [];
  const porClave = new Map<string, number>();
  for (const fila of filas) {
    const clave = fila.clave?.toString().trim();
    if (!clave) continue;
    const unidades = aNumero(fila.cantidad) ?? 1;
    porClave.set(clave, (porClave.get(clave) ?? 0) + unidades);
  }
  const items = [...porClave.entries()].map(([clave, total]) => ({
    clave,
    totalUnidades: redondear(total),
    promedioDiario: redondear(total / diasConDatos),
  }));
  items.sort((a, b) => b.totalUnidades - a.totalUnidades);
  return items.slice(0, n);
}

// Cuántas fechas CALENDARIO distintas (no cuántas filas) hay en el módulo --
// denominador de promedioDiarioPorProducto, ver comentario de ahí.
export function fechasDistintas(filas: { f?: string | null }[]): number {
  const dias = new Set<number>();
  for (const fila of filas) {
    const t = fechaUTC(fila.f);
    if (t !== null) dias.add(t);
  }
  return dias.size;
}

export interface MesConVariacion extends TotalMes {
  variacionPct: number | null; // null: el mes anterior no tuvo ventas, no hay con qué comparar
}

// "Comparativo de ventas": anota cada mes de totalesPorMes() con la variación
// % contra el mes INMEDIATO anterior del mismo arreglo (que ya viene ordenado
// del más antiguo al más reciente) -- reusa el mismo total ya calculado, no
// vuelve a leer nada.
export function variacionMensual(meses: TotalMes[]): MesConVariacion[] {
  return meses.map((m, i) => {
    const anterior = meses[i - 1];
    const variacionPct = anterior && anterior.total > 0 ? redondear(((m.total - anterior.total) / anterior.total) * 100) : null;
    return { ...m, variacionPct };
  });
}
