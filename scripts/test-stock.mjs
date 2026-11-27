// Chequeo de esStock/esMenu/parsearReceta: node scripts/test-stock.mjs
import assert from "node:assert";
import { esStock, esMenu, parsearReceta } from "../src/lib/stock.ts";

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

// --- esMenu ---
const menuReal = [
  { key: "producto", label: "Plato o bebida", tipo: "texto", rol: "producto", sospechosa: false },
  { key: "precio", label: "Precio", tipo: "numero", rol: "precio", sospechosa: false },
  { key: "composicion", label: "Composición", tipo: "texto", rol: "composicion", sospechosa: false },
];
assert.strictEqual(esMenu(menuReal), true);
// Sin columna "composicion", no es Menú (sería indistinguible de cualquier
// otro módulo con solo Producto)
assert.strictEqual(esMenu([{ key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false }]), false);
// Un Stock real tampoco "parece" Menú (no tiene composicion)
assert.strictEqual(esMenu(stockReal), false);

// --- parsearReceta ---
assert.deepStrictEqual(
  parsearReceta("Carne:0.2, Papa:0.3, Cebolla:0.1"),
  [{ nombre: "Carne", cantidad: 0.2 }, { nombre: "Papa", cantidad: 0.3 }, { nombre: "Cebolla", cantidad: 0.1 }]
);
// Bebida simple: 1 sola linea, ella misma
assert.deepStrictEqual(parsearReceta("Gaseosa 1L:1"), [{ nombre: "Gaseosa 1L", cantidad: 1 }]);
// Entradas sucias se descartan en silencio: sin ":", cantidad no numerica, cantidad <= 0, vacio
assert.deepStrictEqual(parsearReceta("SinDosPuntos, Carne:abc, Papa:0, Cebolla:-1, ,"), []);
assert.deepStrictEqual(parsearReceta(""), []);

console.log("OK: test-stock (todas las aserciones pasaron)");
