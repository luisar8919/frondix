// Chequeo del agrupador: node scripts/test-agrupar-hojas.mjs
// Importa el agrupador real (.ts), sin copiar la lógica.
import assert from "node:assert";
import * as XLSX from "xlsx";
import { agruparHojas } from "../src/lib/excel-parser.ts";

function libro(hojas) {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true });
}

// --- 2 familias claras + 1 hoja suelta; una hoja tiene más columnas que la otra ---
const { grupos, hojasOmitidas } = agruparHojas(libro({
  Noviembre: [["Juegos", "Consola", "Costo", "Edad", "Lugar"], ["Mario", "Wii", 70, "25-34", "SM"]],
  Diciembre: [
    ["Juegos", "Consola", "Venta", "Costo", "Ganancia", "Ajuste Precio", "Edad", "Lugar"],
    ["SMT V", "Switch", 60, 0, 60, "No", "25-34", "SM"],
    ["Balatro", "Switch", 120, 70, 50, "No", "18-24", "RP"],
  ],
  "Caja Nov": [["Concepto", "Entrada"], ["Ventas", 620]],
  Suelta1: [["Stock"], ["Mario"]],
}), 3);

assert.strictEqual(grupos.length, 3, "máximo 3 grupos");
const ventas = grupos.find((g) => g.hojas.includes("Diciembre"));
assert.ok(ventas.hojas.includes("Noviembre"), "Noviembre se agrupa con Diciembre (misma familia, menos columnas)");
assert.strictEqual(ventas.columnas.length, 8, "el esquema es el de la hoja con más columnas");
assert.strictEqual(ventas.filas.length, 3);
assert.strictEqual(ventas.filas.find((f) => f.juegos === "Mario").ganancia, null, "lo que le falta a Noviembre queda en null");
assert.strictEqual(grupos.find((g) => g.hojas.includes("Caja Nov")).hojas.length, 1, "Caja es otra familia");
assert.strictEqual(hojasOmitidas.length, 0);

// --- más de 3 familias: se omiten las de menos datos ---
const libro4 = libro(Object.fromEntries(["A", "B", "C", "D"].map((n, i) => [
  n, [[`col_${n}`, "x"], ...Array.from({ length: (4 - i) * 2 }, (_, j) => [`v${j}`, j])],
])));
const r2 = agruparHojas(libro4, 3);
assert.strictEqual(r2.grupos.length, 3, "se capa a 3 aunque haya 4 familias");
assert.deepStrictEqual(r2.hojasOmitidas, ["D"], "queda afuera la de menos datos");

// --- archivo muy pesado: rechazo temprano, no cuelga intentando parsear ---
const libroFalsoGrande = libro({ Hoja1: [["a"], [1]] });
Object.defineProperty(libroFalsoGrande, "byteLength", { value: 25 * 1024 * 1024 });
assert.throws(() => agruparHojas(libroFalsoGrande, 3), /máximo soportado/, "rechaza archivos de más de 20MB");

// --- demasiadas hojas: se procesan solo las primeras 60, el resto queda omitido ---
const hojasDeMas = Object.fromEntries(
  Array.from({ length: 65 }, (_, i) => [`H${i}`, [["col"], [i]]])
);
const r3 = agruparHojas(libro(hojasDeMas), 3);
const totalHojasEnGrupos = r3.grupos.reduce((s, g) => s + g.hojas.length, 0);
assert.strictEqual(totalHojasEnGrupos + r3.hojasOmitidas.length, 65, "no se pierde el conteo total");
assert.ok(r3.hojasOmitidas.includes("H60"), "hojas más allá del tope 60 quedan omitidas");

console.log("OK: test-agrupar-hojas (todas las aserciones pasaron)");
