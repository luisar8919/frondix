// node scripts/test-divisor.mjs
import assert from "node:assert";
import { dividirVentasYCompras } from "../src/lib/divisor.ts";

const filas = [
  { tipo: "Compra", fecha: "2026-10-01", producto: "Polo", monto: 20 },
  { tipo: "Venta", fecha: "2026-10-02", producto: "Polo", monto: 50 },
  { tipo: "Compra", fecha: "2026-10-05", producto: "Polo", monto: 25 }, // compra más reciente del mismo producto
  { tipo: "Venta", fecha: "2026-10-06", producto: "Polo", monto: 55 },
  { tipo: "Venta", fecha: "2026-10-07", producto: "Short", monto: 40 }, // sin compra registrada de Short
  { tipo: "Venta", fecha: "2026-10-08", producto: "Polo", monto: 60, costo: 10 }, // ya traía costo, no se pisa
  { tipo: "Ajuste", fecha: "2026-10-09", producto: "Polo", monto: 1 }, // no clasifica
];

const r = dividirVentasYCompras(filas, "tipo", {
  claveProducto: "producto",
  claveMonto: "monto",
  claveFecha: "fecha",
  claveCosto: "costo",
});

assert.strictEqual(r.compras.length, 2);
assert.strictEqual(r.ventas.length, 4);
assert.strictEqual(r.sinClasificar, 1);

// Las ventas de Polo del 10-02 y 10-06 toman el costo de la compra más reciente ANTES de calcular
// (se usa la última compra conocida del lote, no por fecha de la venta -- ver doc de la función)
assert.strictEqual(r.ventas.find((v) => v.fecha === "2026-10-02").costo, 25, "toma la compra más reciente del producto");
assert.strictEqual(r.ventas.find((v) => v.fecha === "2026-10-06").costo, 25);
assert.strictEqual(r.ventas.find((v) => v.producto === "Short").costo, undefined, "sin compra de ese producto, no inventa un costo");
assert.strictEqual(r.ventas.find((v) => v.costo === 10).costo, 10, "si ya traía costo propio, no se lo pisa");

console.log("OK: test-divisor (todas las aserciones pasaron)");
