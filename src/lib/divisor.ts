import { esVenta, esCompra } from "./roles.ts";

export interface ResultadoDivision {
  ventas: Record<string, unknown>[];
  compras: Record<string, unknown>[];
  // Filas (no solo la cuenta) que no matchearon ni esVenta ni esCompra -- se
  // conservan para que /api/upload/auto pueda ofrecerle a Gemini que las
  // clasifique usando de ejemplo las filas de esta misma hoja que sí se
  // reconocieron, en vez de solo avisar que se dejaron fuera.
  sinClasificar: Record<string, unknown>[];
}

// Divide las filas de una hoja mixta (ventas y compras juntas) en dos grupos,
// según el valor de la columna de tipo (ver roles.ts: esVenta/esCompra). Las
// filas que no matchean ninguno de los dos patrones no se pierden -- se
// devuelven en sinClasificar, nunca se adivinan acá (ver clasificarConIA en
// sugerencia-ia.ts para el camino que sí intenta adivinar, con IA y revisión).
// Solo separa: completar el costo de las ventas es un paso aparte (ver
// preciosDeCompra/completarCostos abajo), para poder juntar precios de
// compra de CUALQUIER pestaña del archivo, no solo de la que se divide.
export function dividirVentasYCompras(filas: Record<string, unknown>[], claveTipo: string): ResultadoDivision {
  const ventas: Record<string, unknown>[] = [];
  const compras: Record<string, unknown>[] = [];
  const sinClasificar: Record<string, unknown>[] = [];

  for (const fila of filas) {
    const tipo = fila[claveTipo];
    if (esVenta(tipo)) ventas.push(fila);
    else if (esCompra(tipo)) compras.push(fila);
    else sinClasificar.push(fila);
  }

  return { ventas, compras, sinClasificar };
}

export interface PrecioCompra {
  precio: number; // costo promedio PONDERADO por unidad (totalGastado / totalUnidades)
  totalGastado: number;
  totalUnidades: number;
}

// Costo promedio PONDERADO por producto, a partir de filas ya sabidas como
// "compra" (una pestaña entera de Compras, o la mitad de compras de una
// pestaña dividida -- a esta función no le importa de dónde vinieron). Junta
// TODAS las compras del producto (no solo la más reciente) y divide el total
// gastado entre el total de unidades: un lote grande y barato no pesa igual
// que uno chico y caro. Si una fila no trae cantidad, cuenta como 1 unidad
// (mismo criterio que el resto del código, ver ajustarStockDesdeRegistro).
export function preciosDeCompra(
  filasCompra: Record<string, unknown>[],
  claveProducto: string,
  claveMonto: string,
  claveCantidad?: string
): Map<string, PrecioCompra> {
  const acumulado = new Map<string, { totalGastado: number; totalUnidades: number }>();
  for (const c of filasCompra) {
    const producto = c[claveProducto]?.toString().trim();
    const monto = Number(c[claveMonto]);
    if (!producto || !Number.isFinite(monto)) continue;
    const cantidadCruda = claveCantidad ? Number(c[claveCantidad]) : NaN;
    const cantidad = Number.isFinite(cantidadCruda) && cantidadCruda > 0 ? cantidadCruda : 1;
    const actual = acumulado.get(producto) ?? { totalGastado: 0, totalUnidades: 0 };
    actual.totalGastado += monto;
    actual.totalUnidades += cantidad;
    acumulado.set(producto, actual);
  }
  return aMapaDePrecios(acumulado);
}

function aMapaDePrecios(acumulado: Map<string, { totalGastado: number; totalUnidades: number }>): Map<string, PrecioCompra> {
  const resultado = new Map<string, PrecioCompra>();
  for (const [producto, { totalGastado, totalUnidades }] of acumulado) {
    resultado.set(producto, { precio: totalUnidades > 0 ? totalGastado / totalUnidades : 0, totalGastado, totalUnidades });
  }
  return resultado;
}

// Junta los promedios de compra de varias pestañas/módulos en un solo mapa --
// SUMA los totales de cada fuente (no se queda con "el más reciente") para
// que el promedio ponderado considere TODAS las compras de TODAS las fuentes
// juntas, no solo de una pestaña.
export function combinarPrecios(mapas: Map<string, PrecioCompra>[]): Map<string, PrecioCompra> {
  const acumulado = new Map<string, { totalGastado: number; totalUnidades: number }>();
  for (const mapa of mapas) {
    for (const [producto, info] of mapa) {
      const actual = acumulado.get(producto) ?? { totalGastado: 0, totalUnidades: 0 };
      actual.totalGastado += info.totalGastado;
      actual.totalUnidades += info.totalUnidades;
      acumulado.set(producto, actual);
    }
  }
  return aMapaDePrecios(acumulado);
}

// Completa el costo de cada venta (in-place) con el precio de compra más
// reciente de ese producto -- el que estaba vigente cuando se registró la
// compra, no un promedio inventado. Nunca pisa un costo que la fila ya traía.
export function completarCostos(
  filasVenta: Record<string, unknown>[],
  precios: Map<string, PrecioCompra>,
  claveProducto: string,
  claveCosto: string
): void {
  for (const v of filasVenta) {
    const yaTieneCosto = v[claveCosto] !== undefined && v[claveCosto] !== null && v[claveCosto] !== "";
    if (yaTieneCosto) continue;
    const producto = v[claveProducto]?.toString().trim();
    const precio = producto ? precios.get(producto)?.precio : undefined;
    if (precio !== undefined) v[claveCosto] = precio;
  }
}

export interface ClavesVentaCosto {
  claveVenta: string;
  claveCosto: string;
  claveProducto?: string;
  claveCliente?: string;
  claveProveedor?: string;
  claveCantidad?: string;
  claveFecha?: string;
}

// Para hojas donde cada fila YA trae el precio de venta Y el costo juntos (sin
// columna de Tipo que las distinga) -- típico de un catálogo donde cada
// producto vendido también fue comprado. Por cada fila de origen arma una
// fila de venta (si trae precio de venta) y una de compra (si trae costo);
// las columnas de salida son siempre las mismas (producto/fecha/monto/
// cliente/proveedor/cantidad), sin importar cómo se llamaban en el Excel.
// La cantidad, si no viene, es 1 (una unidad por fila es lo más común).
export function separarVentaYCosto(
  filas: Record<string, unknown>[],
  claves: ClavesVentaCosto
): { ventas: Record<string, unknown>[]; compras: Record<string, unknown>[] } {
  const ventas: Record<string, unknown>[] = [];
  const compras: Record<string, unknown>[] = [];
  const hoy = new Date().toISOString().slice(0, 10);

  for (const fila of filas) {
    const cantidadCruda = claves.claveCantidad ? fila[claves.claveCantidad] : undefined;
    const cantidad = cantidadCruda === undefined || cantidadCruda === null || cantidadCruda === "" ? 1 : cantidadCruda;
    const base: Record<string, unknown> = { cantidad };
    if (claves.claveProducto) base.producto = fila[claves.claveProducto];
    // Si la columna de fecha existe pero ESTA fila la trae vacía, se usa la
    // fecha de hoy como referencia -- mismo criterio que cuando toda la tabla
    // no tiene columna de fecha (ver /api/upload/auto), pero fila por fila.
    if (claves.claveFecha) {
      const v = fila[claves.claveFecha];
      base.fecha = v !== undefined && v !== null && v !== "" ? v : hoy;
    }

    const venta = fila[claves.claveVenta];
    if (venta !== undefined && venta !== null && venta !== "") {
      const filaVenta: Record<string, unknown> = { ...base, monto: venta };
      if (claves.claveCliente) filaVenta.cliente = fila[claves.claveCliente];
      ventas.push(filaVenta);
    }

    const costo = fila[claves.claveCosto];
    if (costo !== undefined && costo !== null && costo !== "") {
      const filaCompra: Record<string, unknown> = { ...base, monto: costo };
      if (claves.claveProveedor) filaCompra.proveedor = fila[claves.claveProveedor];
      compras.push(filaCompra);
    }
  }

  return { ventas, compras };
}

// Valores distintos de una columna (para armar una tabla maestra de Clientes
// o Proveedores), en el orden en que aparecen, sin vacíos.
export function valoresDistintos(filas: Record<string, unknown>[], clave: string): string[] {
  const vistos = new Set<string>();
  const valores: string[] = [];
  for (const f of filas) {
    const v = f[clave]?.toString().trim();
    if (v && !vistos.has(v)) {
      vistos.add(v);
      valores.push(v);
    }
  }
  return valores;
}

// Cantidad de stock por producto, a partir de filas con columna Stock (rol
// "stock", ver roles.ts). Una fila de stock es una foto del conteo actual, no
// un movimiento: si el mismo producto aparece más de una vez, se queda con el
// último valor, no se suman.
export function cantidadesDeStock(
  filasStock: Record<string, unknown>[],
  claveProducto: string,
  claveStock: string
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const f of filasStock) {
    const producto = f[claveProducto]?.toString().trim();
    const cantidad = Number(f[claveStock]);
    if (producto && Number.isFinite(cantidad)) mapa.set(producto, cantidad);
  }
  return mapa;
}
