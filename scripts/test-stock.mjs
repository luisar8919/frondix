// Chequeo de esStock: node scripts/test-stock.mjs
import assert from "node:assert";
import { esStock } from "../src/lib/stock.ts";

// Stock real: cantidad + producto, sin monto/cliente/proveedor -> tipoModulo "otro"
const stockReal = [
  { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
  { key: "cantidad", label: "Cantidad", tipo: "numero", rol: null, sospechosa: false },
];
assert.strictEqual(esStock(stockReal), true);

// Bug real visto en produccion: una Compra con su propia columna "Cantidad"
// (rol "cantidad", key "cantidad" por el mismo armado de keys) NO debe
// confundirse con un modulo de Stock -- antes del fix, esto daba true.
const compraConCantidad = [
  { key: "proveedor", label: "Proveedor", tipo: "texto", rol: "proveedor", sospechosa: false },
  { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
  { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
  { key: "cantidad", label: "Cantidad", tipo: "numero", rol: "cantidad", sospechosa: false },
];
assert.strictEqual(esStock(compraConCantidad), false, "una Compra con columna Cantidad no debe parecer un modulo de Stock");

// Lo mismo para una Venta con su propia columna "Cantidad"
const ventaConCantidad = [
  { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
  { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
  { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
  { key: "cantidad", label: "Cantidad", tipo: "numero", rol: "cantidad", sospechosa: false },
];
assert.strictEqual(esStock(ventaConCantidad), false, "una Venta con columna Cantidad no debe parecer un modulo de Stock");

// Sin columna "cantidad" (key fija) o sin rol producto, tampoco es Stock
assert.strictEqual(esStock([{ key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false }]), false);
assert.strictEqual(esStock([{ key: "cantidad", label: "Cantidad", tipo: "numero", rol: null, sospechosa: false }]), false);

console.log("OK: test-stock (todas las aserciones pasaron)");
