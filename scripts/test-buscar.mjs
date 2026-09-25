// Chequeo de la búsqueda: node scripts/test-buscar.mjs
import assert from "node:assert";

function normalizar(v) {
  return String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function filtrarRegistros(registros, busqueda) {
  const terminos = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (terminos.length === 0) return registros;
  return registros.filter((r) => {
    const textoFila = normalizar(Object.values(r.data).join(" "));
    return terminos.every((t) => textoFila.includes(t));
  });
}

const registros = [
  { id: "1", data: { nombre: "José Pérez", ciudad: "Lima" } },
  { id: "2", data: { nombre: "Ana Ramírez", ciudad: "Arequipa" } },
  { id: "3", data: { nombre: "Luis Torres", ciudad: "Lima" } },
];

assert.strictEqual(filtrarRegistros(registros, "").length, 3, "sin búsqueda, devuelve todo");
assert.deepStrictEqual(filtrarRegistros(registros, "jose").map((r) => r.id), ["1"], "encuentra sin tilde lo que tiene tilde");
assert.deepStrictEqual(filtrarRegistros(registros, "LIMA").map((r) => r.id), ["1", "3"], "ignora mayúsculas y busca en cualquier columna");
assert.deepStrictEqual(filtrarRegistros(registros, "luis lima").map((r) => r.id), ["3"], "varios términos exige que estén todos (AND)");
assert.strictEqual(filtrarRegistros(registros, "cusco").length, 0, "sin coincidencias, devuelve vacío");

console.log("OK: test-buscar (5 aserciones pasaron)");
