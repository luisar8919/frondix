// Chequeo de los enlaces entre tablas: node scripts/test-enlaces.mjs
// Importa el codigo real (.ts), sin copiar la logica.
import assert from "node:assert";
import {
  opcionesDeEnlace, relacionesEntrantes, filtrarPorColumna, claveValida, urlFiltrada,
  codificarEnlace, decodificarEnlace,
} from "../src/lib/enlaces.ts";

const col = (key, label, enlace) => ({ key, label, tipo: "texto", rol: null, sospechosa: false, enlace });
const clientes = { id: "C", nombre: "Clientes", columnas: [col("nombre", "Nombre"), col("telefono", "Telefono")] };
const ventas = { id: "V", nombre: "Ventas", columnas: [col("producto", "Producto"), col("cliente", "Cliente", { datasetId: "C", columnaKey: "nombre" })] };
const todos = [clientes, ventas];

// opciones: solo columnas de OTRAS tablas, con etiqueta legible
const op = opcionesDeEnlace(todos, "V");
assert.deepStrictEqual(op.map((o) => o.valor), ["C|nombre", "C|telefono"], "no ofrece columnas de la propia tabla");
assert.strictEqual(op[0].etiqueta, "Clientes > Nombre");

// relaciones entrantes: Clientes sabe que Ventas apunta a el
const ent = relacionesEntrantes(todos, "C");
assert.deepStrictEqual(ent, [{ datasetId: "V", nombre: "Ventas", columnaKey: "cliente", miColumnaKey: "nombre" }]);
assert.deepStrictEqual(relacionesEntrantes(todos, "V"), [], "Ventas no tiene nada apuntandole");

// filtro por valor exacto (ignora espacios sobrantes; un numero se compara como texto)
const regs = [
  { id: 1, data: { cliente: "Ana Torres", monto: 120 } },
  { id: 2, data: { cliente: " Luis Ramirez ", monto: 80 } },
  { id: 3, data: { cliente: "Ana Torres", monto: 45 } },
];
assert.deepStrictEqual(filtrarPorColumna(regs, "cliente", "Ana Torres").map((r) => r.id), [1, 3]);
assert.deepStrictEqual(filtrarPorColumna(regs, "cliente", "Luis Ramirez").map((r) => r.id), [2]);
assert.deepStrictEqual(filtrarPorColumna(regs, "monto", "80").map((r) => r.id), [2]);
assert.strictEqual(filtrarPorColumna(regs, null, null).length, 3, "sin filtro devuelve todo");
assert.strictEqual(filtrarPorColumna(regs, "cliente", "Nadie").length, 0);

// claves: solo las que produce el parser (nada de comillas ni operadores)
assert.strictEqual(claveValida("cliente_2"), true);
for (const mala of ["a.b", "a)b", "nombre,x", "", "A B", "x->>y", null, 5]) assert.strictEqual(claveValida(mala), false, String(mala));

// codificar / decodificar el valor del selector
assert.strictEqual(codificarEnlace({ datasetId: "C", columnaKey: "nombre" }), "C|nombre");
assert.strictEqual(codificarEnlace(null), "");
assert.deepStrictEqual(decodificarEnlace("C|nombre"), { datasetId: "C", columnaKey: "nombre" });
assert.strictEqual(decodificarEnlace(""), null);

// la url lleva el valor codificado
assert.strictEqual(urlFiltrada("V", "cliente", "Ana & Luis"), "/dashboard/V?filtrarCol=cliente&filtrarVal=Ana%20%26%20Luis");

console.log("OK: test-enlaces (todas las aserciones pasaron)");
