// node scripts/test-divisor.mjs
import assert from "node:assert";
import { dividirVentasYCompras, preciosDeCompra, combinarPrecios, completarCostos, cantidadesDeStock, separarVentaYCosto, valoresDistintos } from "../src/lib/divisor.ts";

// --- dividirVentasYCompras: solo separa, no toca costos ---
const filas = [
  { tipo: "Compra", fecha: "2026-10-01", producto: "Polo", monto: 20 },
  { tipo: "Venta", fecha: "2026-10-02", producto: "Polo", monto: 50 },
  { tipo: "Venta", fecha: "2026-10-07", producto: "Short", monto: 40 },
  { tipo: "Ajuste", fecha: "2026-10-09", producto: "Polo", monto: 1 }, // no clasifica
];
const r = dividirVentasYCompras(filas, "tipo");
assert.strictEqual(r.compras.length, 1);
assert.strictEqual(r.ventas.length, 2);
assert.strictEqual(r.sinClasificar.length, 1);
assert.strictEqual(r.sinClasificar[0].producto, "Polo", "la fila sin clasificar se conserva, no solo se cuenta");

// --- preciosDeCompra: costo promedio PONDERADO (total gastado / total unidades) ---
const compras1 = [
  { producto: "Polo", monto: 20, cantidad: 2 }, // 2 unidades a 10 c/u
  { producto: "Polo", monto: 25, cantidad: 1 }, // 1 unidad a 25
];
const precios1 = preciosDeCompra(compras1, "producto", "monto", "cantidad");
assert.strictEqual(precios1.get("Polo").precio, 15, "(20+25)/(2+1) = 15, no un promedio simple de precios");

// --- sin columna de cantidad, cada fila cuenta como 1 unidad (promedio simple) ---
const precios1b = preciosDeCompra(compras1, "producto", "monto");
assert.strictEqual(precios1b.get("Polo").precio, 22.5, "(20+25)/2 si no hay cantidad");

// --- combinarPrecios: junta mapas de varias pestañas SUMANDO totales, no se queda con el último ---
const compras2 = [{ producto: "Polo", monto: 30, cantidad: 3 }]; // de otra pestaña: 3 unidades a 10 c/u
const precios2 = preciosDeCompra(compras2, "producto", "monto", "cantidad");
const combinado = combinarPrecios([precios1, precios2]);
assert.strictEqual(combinado.get("Polo").precio, 12.5, "(20+25+30)/(2+1+3) = 12.5, junta TODAS las compras de ambas pestañas");

// --- completarCostos: solo si falta, nunca pisa uno que ya traía ---
const ventas = [
  { producto: "Polo", monto: 55 }, // sin costo -> se completa
  { producto: "Short", monto: 40 }, // sin compra conocida -> no se inventa
  { producto: "Polo", monto: 60, costo: 10 }, // ya traía costo -> no se toca
];
completarCostos(ventas, combinado, "producto", "costo");
assert.strictEqual(ventas[0].costo, 12.5);
assert.strictEqual(ventas[1].costo, undefined);
assert.strictEqual(ventas[2].costo, 10);

// --- cantidadesDeStock: última fila gana, no se suma ---
const filasStock = [
  { producto: "Polo", stock: 5 },
  { producto: "Short", stock: 12 },
  { producto: "Polo", stock: 3 }, // reemplaza, no suma
];
const stock = cantidadesDeStock(filasStock, "producto", "stock");
assert.strictEqual(stock.get("Polo"), 3);
assert.strictEqual(stock.get("Short"), 12);

// --- separarVentaYCosto: cada fila de origen arma una venta y una compra ---
const catalogo = [
  { juego: "Polo", venta: 50, costo: 20, cliente: "Ana" },
  { juego: "Short", venta: 35, costo: 15, cliente: "Luis" },
  { juego: "Gorra", venta: 10, costo: "", cliente: "" }, // sin costo -> no genera compra
];
const sep = separarVentaYCosto(catalogo, { claveVenta: "venta", claveCosto: "costo", claveProducto: "juego", claveCliente: "cliente" });
assert.strictEqual(sep.ventas.length, 3);
assert.strictEqual(sep.compras.length, 2, "Gorra sin costo no genera fila de compra");
assert.strictEqual(sep.ventas[0].producto, "Polo");
assert.strictEqual(sep.ventas[0].monto, 50);
assert.strictEqual(sep.ventas[0].cliente, "Ana");
assert.strictEqual(sep.ventas[0].cantidad, 1, "sin columna de cantidad, 1 por defecto");
assert.strictEqual(sep.compras[0].monto, 20, "el costo se vuelve el monto de la compra");
assert.strictEqual(sep.compras[0].proveedor, undefined, "sin columna de proveedor en el origen, no se inventa");

const conCantidad = separarVentaYCosto(
  [{ producto: "Polo", venta: 50, costo: 20, unidades: 3 }],
  { claveVenta: "venta", claveCosto: "costo", claveProducto: "producto", claveCantidad: "unidades" }
);
assert.strictEqual(conCantidad.ventas[0].cantidad, 3);

// Con columna de fecha: si esta fila la trae vacía, usa hoy; si la trae, la respeta
const hoy = new Date().toISOString().slice(0, 10);
const conFecha = separarVentaYCosto(
  [
    { producto: "Polo", venta: 50, costo: 20, fecha: "2026-01-15" },
    { producto: "Short", venta: 35, costo: 15, fecha: "" },
  ],
  { claveVenta: "venta", claveCosto: "costo", claveProducto: "producto", claveFecha: "fecha" }
);
assert.strictEqual(conFecha.ventas[0].fecha, "2026-01-15");
assert.strictEqual(conFecha.ventas[1].fecha, hoy, "fila sin fecha propia usa la de hoy");
assert.strictEqual(conFecha.compras[1].fecha, hoy, "mismo criterio para la compra generada de esa fila");
assert.strictEqual(conCantidad.compras[0].cantidad, 3);

// --- valoresDistintos: en orden de aparición, sin vacíos ni repetidos ---
const distintos = valoresDistintos(
  [{ c: "Ana" }, { c: "Luis" }, { c: "Ana" }, { c: "" }, { c: null }],
  "c"
);
assert.deepStrictEqual(distintos, ["Ana", "Luis"]);

console.log("OK: test-divisor (todas las aserciones pasaron)");
