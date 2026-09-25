// Chequeo de hojas sin encabezado: node scripts/test-sin-encabezado.mjs
// Importa el parser real (.ts), sin copiar la lógica.
import assert from "node:assert";
import * as XLSX from "xlsx";
import { parsearExcel } from "../src/lib/excel-parser.ts";

function libro(hojas) {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true });
}

// --- 1. lista de una columna ("Stock"): NO se pierde el primer ítem ---
const stock = parsearExcel(libro({ Stock: [["Filtro de aceite"], ["Bujia NGK"], ["Liquido de frenos"]] }), "Stock");
assert.strictEqual(stock.sinEncabezado, true, "una lista de una columna se detecta sin encabezado");
assert.strictEqual(stock.filas.length, 3, "los 3 ítems quedan como datos (antes se perdía el primero)");
assert.strictEqual(stock.columnas[0].label, "Stock", "la columna toma el nombre de la hoja");
assert.strictEqual(stock.filas[0].stock, "Filtro de aceite", "el primer ítem es el primer registro");

// --- 2. primera fila con números/fechas (no es encabezado): filas completas + "Columna N" ---
const nums = parsearExcel(libro({ H: [[10, 20, 30], [40, 50, 60]] }), "H");
assert.strictEqual(nums.sinEncabezado, true);
assert.strictEqual(nums.filas.length, 2);
assert.deepStrictEqual(nums.columnas.map((c) => c.label), ["Columna 1", "Columna 2", "Columna 3"]);
assert.strictEqual(nums.filas[0].columna_1, 10);

// --- 3. una hoja normal con encabezados NO cambia de comportamiento ---
const normal = parsearExcel(libro({ V: [["Producto", "Monto"], ["Aceite", 120], ["Filtro", 45]] }), "V");
assert.strictEqual(normal.sinEncabezado, false);
assert.strictEqual(normal.filas.length, 2);
assert.deepStrictEqual(normal.columnas.map((c) => c.key), ["producto", "monto"]);

// --- 4. el usuario puede forzar en ambos sentidos ---
const forzadoSin = parsearExcel(libro({ V: [["Producto", "Monto"], ["Aceite", 120]] }), "V", undefined, { sinEncabezado: true });
assert.strictEqual(forzadoSin.filas.length, 2, "forzado sin encabezado: 'Producto' pasa a ser un dato");
assert.strictEqual(forzadoSin.columnas.every((c) => c.sospechosa), true, "los nombres inventados piden confirmación");
const forzadoCon = parsearExcel(libro({ S: [["Bujia"], ["Filtro"]] }), "S", undefined, { sinEncabezado: false });
assert.strictEqual(forzadoCon.filas.length, 1, "forzado con encabezado: 'Bujia' es el título");
assert.strictEqual(forzadoCon.columnas[0].label, "Bujia");

// --- 5. los renombres del usuario se aplican también sin encabezado ---
const ren = parsearExcel(libro({ Stock: [["Filtro"], ["Bujia"]] }), "Stock", { stock: "Repuestos" });
assert.strictEqual(ren.columnas[0].label, "Repuestos");
assert.strictEqual(ren.filas.length, 2);

console.log("OK: test-sin-encabezado (todas las aserciones pasaron)");
