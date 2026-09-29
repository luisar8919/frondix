// Chequeo de sugerirRoles: node scripts/test-roles.mjs
// Importa el .ts real (Node 22.18+/24 quita los tipos solo), sin duplicar la lógica.
import assert from "node:assert";
import { sugerirRoles, estructuraConfusa } from "../src/lib/roles.ts";

// Ventas del Excel real
const ventas = sugerirRoles([
  { key: "juegos", label: "Juegos", tipo: "texto" },
  { key: "consola", label: "Consola", tipo: "texto" },
  { key: "venta", label: "Venta", tipo: "numero" },
  { key: "costo", label: "Costo", tipo: "numero" },
  { key: "ganancia", label: "Ganancia", tipo: "numero" },
  { key: "edad", label: "Edad", tipo: "texto" },
]);
assert.strictEqual(ventas.venta, "monto", "'Venta' numérica es el monto");
assert.strictEqual(ventas.juegos, "producto", "'Juegos' es el producto");
assert.strictEqual(ventas.costo, undefined, "'Costo' no se confunde con monto");
assert.strictEqual(ventas.ganancia, undefined);

// Caja del Excel real
const caja = sugerirRoles([
  { key: "concepto", label: "Concepto", tipo: "texto" },
  { key: "entrada", label: "Entrada", tipo: "numero" },
]);
assert.strictEqual(caja.entrada, "monto");
assert.strictEqual(caja.concepto, "producto");

// Con tildes, y "Teléfono del cliente" debe ir a telefono, no a cliente
const clientes = sugerirRoles([
  { key: "nombre", label: "Nombre", tipo: "texto" },
  { key: "telefono_del_cliente", label: "Teléfono del cliente", tipo: "texto" },
  { key: "fecha_de_compra", label: "Fecha de compra", tipo: "fecha" },
]);
assert.strictEqual(clientes.telefono_del_cliente, "telefono");
assert.strictEqual(clientes.nombre, "cliente");
assert.strictEqual(clientes.fecha_de_compra, "fecha");

// Una fecha guardada como texto no se marca como fecha (el usuario la elige a mano)
const fechaTexto = sugerirRoles([{ key: "fecha", label: "Fecha", tipo: "texto" }]);
assert.strictEqual(fechaTexto.fecha, undefined);

// Máximo una columna por rol
const dobles = sugerirRoles([
  { key: "venta", label: "Venta", tipo: "numero" },
  { key: "total", label: "Total", tipo: "numero" },
]);
assert.strictEqual(Object.values(dobles).filter((r) => r === "monto").length, 1);

// --- estructuraConfusa: cuándo ofrecer la sugerencia por IA ---
assert.strictEqual(estructuraConfusa([]), false, "sin columnas no hay nada que sugerir");
assert.strictEqual(
  estructuraConfusa([{ rol: "cliente", sospechosa: false }, { rol: null, sospechosa: false }]),
  false,
  "con al menos un rol reconocido, no es confusa"
);
assert.strictEqual(
  estructuraConfusa([{ rol: null, sospechosa: false }, { rol: null, sospechosa: false }]),
  true,
  "ningún rol reconocido = confusa"
);
assert.strictEqual(
  estructuraConfusa([
    { rol: "cliente", sospechosa: false },
    { rol: null, sospechosa: true },
    { rol: null, sospechosa: true },
    { rol: null, sospechosa: true },
  ]),
  true,
  "más del 40% de columnas sospechosas = confusa, aunque haya un rol"
);

console.log("OK: test-roles (todas las aserciones pasaron)");
