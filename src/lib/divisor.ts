import { esVenta, esCompra } from "./roles.ts";

export interface ResultadoDivision {
  ventas: Record<string, unknown>[];
  compras: Record<string, unknown>[];
  sinClasificar: number;
}

// Divide las filas de una hoja mixta (ventas y compras juntas) en dos grupos,
// según el valor de la columna de tipo (ver roles.ts: esVenta/esCompra). Las
// filas que no matchean ninguno de los dos patrones no se pierden -- se
// cuentan en sinClasificar para avisarle al usuario, nunca se adivinan.
// Solo separa: completar el costo de las ventas es un paso aparte (ver
// preciosDeCompra/completarCostos abajo), para poder juntar precios de
// compra de CUALQUIER pestaña del archivo, no solo de la que se divide.
export function dividirVentasYCompras(filas: Record<string, unknown>[], claveTipo: string): ResultadoDivision {
  const ventas: Record<string, unknown>[] = [];
  const compras: Record<string, unknown>[] = [];
  let sinClasificar = 0;

  for (const fila of filas) {
    const tipo = fila[claveTipo];
    if (esVenta(tipo)) ventas.push(fila);
    else if (esCompra(tipo)) compras.push(fila);
    else sinClasificar++;
  }

  return { ventas, compras, sinClasificar };
}

export interface PrecioCompra {
  precio: number;
  fecha: string; // "" si la hoja no tenía fecha -- igual sirve para comparar, solo nunca gana
}

// Precio de compra MÁS RECIENTE por producto, a partir de filas ya sabidas
// como "compra" (una pestaña entera de Compras, o la mitad de compras de una
// pestaña dividida -- a esta función no le importa de dónde vinieron).
export function preciosDeCompra(
  filasCompra: Record<string, unknown>[],
  claveProducto: string,
  claveMonto: string,
  claveFecha?: string
): Map<string, PrecioCompra> {
  const porProducto = new Map<string, PrecioCompra>();
  for (const c of filasCompra) {
    const producto = c[claveProducto]?.toString().trim();
    const monto = Number(c[claveMonto]);
    if (!producto || !Number.isFinite(monto)) continue;
    const fecha = claveFecha ? String(c[claveFecha] ?? "") : "";
    const actual = porProducto.get(producto);
    if (!actual || fecha >= actual.fecha) porProducto.set(producto, { precio: monto, fecha });
  }
  return porProducto;
}

// Junta los precios de compra de varias pestañas/módulos en un solo mapa --
// así da igual si "Zapatillas" se compró según la pestaña Compras o según la
// mitad de compras de un módulo dividido: se queda con el más reciente de
// TODAS las fuentes, no solo de una.
export function combinarPrecios(mapas: Map<string, PrecioCompra>[]): Map<string, PrecioCompra> {
  const combinado = new Map<string, PrecioCompra>();
  for (const mapa of mapas) {
    for (const [producto, info] of mapa) {
      const actual = combinado.get(producto);
      if (!actual || info.fecha >= actual.fecha) combinado.set(producto, info);
    }
  }
  return combinado;
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

  for (const fila of filas) {
    const cantidadCruda = claves.claveCantidad ? fila[claves.claveCantidad] : undefined;
    const cantidad = cantidadCruda === undefined || cantidadCruda === null || cantidadCruda === "" ? 1 : cantidadCruda;
    const base: Record<string, unknown> = { cantidad };
    if (claves.claveProducto) base.producto = fila[claves.claveProducto];
    if (claves.claveFecha) base.fecha = fila[claves.claveFecha];

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
