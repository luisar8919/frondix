// node scripts/test-estructura.mjs  (importa el codigo real .ts)
import assert from "node:assert";
import { nuevaClave, planificarCambios, planEliminarTabla } from "../src/lib/estructura.ts";

const col = (key, label, extra = {}) => ({ key, label, tipo: "texto", rol: null, sospechosa: false, ...extra });
const ventas = [col("cliente", "Cliente", { rol: "cliente", enlace: { datasetId: "cli", columnaKey: "nombre" } }), col("monto", "Monto", { tipo: "numero", rol: "monto" })];
const clientes = [col("nombre", "Nombre"), col("dni", "DNI")];
const otras = [{ id: "ven", nombre: "Ventas", columnas: ventas }];

// claves
assert.strictEqual(nuevaClave("Teléfono móvil", new Set()), "telefono_movil");
assert.strictEqual(nuevaClave("Monto", new Set(["monto"])), "monto_2");
assert.strictEqual(nuevaClave("???", new Set()), "campo");

// renombrar + cambiar rol conserva la clave y el tipo; agregar crea clave nueva
let p = planificarCambios(clientes, [
  { key: "nombre", label: "Nombre completo", tipo: "numero", rol: "cliente" },
  { key: "dni", label: "DNI", tipo: "texto", rol: null },
  { label: "Correo", tipo: "texto", rol: null },
], "Clientes", "cli", otras);
assert.deepStrictEqual(p.columnas.map((c) => [c.key, c.label, c.tipo, c.rol]), [
  ["nombre", "Nombre completo", "texto", "cliente"], // el tipo no cambia
  ["dni", "DNI", "texto", null],
  ["correo", "Correo", "texto", null],
]);
assert.deepStrictEqual(p.eliminadas, []);
assert.strictEqual(p.advertencias.length, 0, "renombrar no rompe enlaces: la clave no cambia");

// quitar un campo al que otra tabla apunta: advierte y marca el enlace a romper
p = planificarCambios(clientes, [{ key: "dni", label: "DNI", tipo: "texto", rol: null }], "Clientes", "cli", otras);
assert.deepStrictEqual(p.eliminadas, ["nombre"]);
assert.strictEqual(p.advertencias.length, 2);
assert.ok(p.advertencias[1].includes("Ventas"));
assert.deepStrictEqual(p.enlacesARomper, [{ datasetId: "ven", columnaKey: "cliente" }]);

// quitar un campo sin enlaces entrantes: solo el aviso de borrado
p = planificarCambios(clientes, [{ key: "nombre", label: "Nombre", tipo: "texto", rol: null }], "Clientes", "cli", otras);
assert.strictEqual(p.advertencias.length, 1);
assert.deepStrictEqual(p.enlacesARomper, []);

// errores
for (const [props, texto] of [
  [[], "al menos un campo"],
  [[{ key: "nombre", label: "  ", tipo: "texto", rol: null }], "nombre"],
  [[{ key: "nombre", label: "A", tipo: "texto", rol: null }, { key: "dni", label: "a", tipo: "texto", rol: null }], "dos campos"],
  [[{ key: "nombre", label: "A", tipo: "texto", rol: null }, { key: "nombre", label: "B", tipo: "texto", rol: null }], "repetido"],
  [[{ key: "fantasma", label: "X", tipo: "texto", rol: null }], "no existe"],
  [[{ label: "X", tipo: "cosa", rol: null }], "Tipo"],
]) {
  const r = planificarCambios(clientes, props, "Clientes", "cli", otras);
  assert.ok("error" in r && r.error.includes(texto), JSON.stringify(props) + " -> " + JSON.stringify(r));
}

// eliminar tabla
const e = planEliminarTabla("cli", "Clientes", otras);
assert.strictEqual(e.advertencias.length, 2);
assert.strictEqual(planEliminarTabla("cli", "Clientes", [{ id: "ven", nombre: "Ventas", columnas: [{ ...ventas[0], enlace: { datasetId: "cli", columnaKey: "nombre" } }] }]).advertencias.length, 2);
assert.strictEqual(planEliminarTabla("ven", "Ventas", [{ id: "cli", nombre: "Clientes", columnas: clientes }]).advertencias.length, 1, "nadie apunta a Ventas");

console.log("OK: test-estructura (todas las aserciones pasaron)");
