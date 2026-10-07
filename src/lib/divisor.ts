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
//
// Si hay columna de Producto y Monto, además calcula el costo de cada venta
// como el monto de compra MÁS RECIENTE del mismo producto (entre las compras
// que se separaron junto con ella): así no hay que teclear el costo a mano
// cuando el mismo Excel ya trae cuánto costó comprar lo que se vendió. Solo
// completa el costo si la fila de venta no traía uno propio.
export function dividirVentasYCompras(
  filas: Record<string, unknown>[],
  claveTipo: string,
  opciones: { claveProducto?: string; claveMonto?: string; claveFecha?: string; claveCosto?: string } = {}
): ResultadoDivision {
  const ventas: Record<string, unknown>[] = [];
  const compras: Record<string, unknown>[] = [];
  let sinClasificar = 0;

  for (const fila of filas) {
    const tipo = fila[claveTipo];
    if (esVenta(tipo)) ventas.push(fila);
    else if (esCompra(tipo)) compras.push(fila);
    else sinClasificar++;
  }

  const { claveProducto, claveMonto, claveFecha, claveCosto } = opciones;
  if (claveProducto && claveMonto && claveCosto) {
    const precioPorProducto = new Map<string, { precio: number; fecha: string }>();
    for (const c of compras) {
      const producto = c[claveProducto]?.toString().trim();
      const monto = Number(c[claveMonto]);
      if (!producto || !Number.isFinite(monto)) continue;
      const fecha = claveFecha ? String(c[claveFecha] ?? "") : "";
      const actual = precioPorProducto.get(producto);
      if (!actual || fecha >= actual.fecha) precioPorProducto.set(producto, { precio: monto, fecha });
    }
    for (const v of ventas) {
      const yaTieneCosto = v[claveCosto] !== undefined && v[claveCosto] !== null && v[claveCosto] !== "";
      if (yaTieneCosto) continue;
      const producto = v[claveProducto]?.toString().trim();
      const precio = producto ? precioPorProducto.get(producto)?.precio : undefined;
      if (precio !== undefined) v[claveCosto] = precio;
    }
  }

  return { ventas, compras, sinClasificar };
}
