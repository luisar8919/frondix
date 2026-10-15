// Chequeo del parser: node scripts/test-excel-parser.mjs
// Importa el parser real (.ts), sin copiar la lógica.
import assert from "node:assert";
import * as XLSX from "xlsx";
import { parsearExcel } from "../src/lib/excel-parser.ts";

function libro(filas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), "Hoja1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true });
}

// --- 1. columnas mixtas, con tildes y una columna sin encabezado ---
const r1 = parsearExcel(libro([
  ["Nombre Cliente", "Teléfono", "", "Monto"],
  ["Ana Pérez", "987654321", null, 150.5],
  ["Luis Ramírez", "912345678", null, 200],
]));
assert.deepStrictEqual(r1.columnas.map((c) => c.key), ["nombre_cliente", "telefono", "monto"], "keys sin tildes y sin la columna vacía");
assert.strictEqual(r1.columnas.find((c) => c.key === "monto").tipo, "numero");
assert.strictEqual(r1.columnas.find((c) => c.key === "nombre_cliente").tipo, "texto");
assert.strictEqual(r1.filas.length, 2);
assert.strictEqual(r1.filas[0].nombre_cliente, "Ana Pérez");
assert.strictEqual(r1.sinEncabezado, false);

// --- 2. encabezados duplicados no se pisan ---
const r2 = parsearExcel(libro([["Nombre", "Nombre"], ["A", "B"]]));
assert.deepStrictEqual(r2.columnas.map((c) => c.key), ["nombre", "nombre_2"]);

// --- 3. encabezado "roto": una fecha y un número como título (hoja "Caja" real) ---
const r3 = parsearExcel(libro([
  ["Concepto", "Entrada", new Date("2026-01-05"), 320],
  ["Ventas", 620, new Date("2026-01-10"), 215],
]));
assert.strictEqual(r3.columnas.find((c) => c.key === "concepto").sospechosa, false, "un título normal no se marca");
assert.strictEqual(r3.columnas.filter((c) => c.sospechosa).length, 2, "los títulos fecha/número se marcan sospechosos");

// --- 4. renombres pisa el label sin romper la key ni los datos ---
const colNumero = r3.columnas.find((c) => c.sospechosa && c.tipo === "numero");
const r4 = parsearExcel(libro([
  ["Concepto", "Entrada", new Date("2026-01-05"), 320],
  ["Ventas", 620, new Date("2026-01-10"), 215],
]), undefined, { [colNumero.key]: "Compras" });
assert.strictEqual(r4.columnas.find((c) => c.key === colNumero.key).label, "Compras");
assert.strictEqual(r4.filas.length, r3.filas.length);

// --- 5. filas vacías (celdas en blanco, no ausentes) se cuentan y se descartan ---
const r5 = parsearExcel(libro([
  ["Cliente", "Monto"],
  ["Ana", 100],
  ["", ""],
  ["Luis", 200],
]));
assert.strictEqual(r5.filas.length, 2, "la fila en blanco no se carga como dato");
assert.strictEqual(r5.filasVaciasDescartadas, 1);
assert.strictEqual(parsearExcel(libro([["Cliente"], ["Ana"]])).filasVaciasDescartadas, 0, "sin filas vacías, queda en 0");

// --- 6. fechas en formatos mezclados: se detecta igual el rol y se
// estandariza cada valor interpretable a yyyy-mm-dd, sin tocar el que no
// se pudo entender (la columna queda marcada sospechosa) ---
const r6 = parsearExcel(libro([
  ["Cliente", "Fecha", "Monto"],
  ["Ana", "2026-09-01", 100], // ISO
  ["Luis", "05/09/2026", 80], // dd/mm/aaaa
  ["Carla", "13-09-2026", 50], // dd-mm-aaaa
  ["Pedro", "9 sept 2026", 95], // texto con mes en palabras
  ["Rosa", new Date(Date.UTC(2026, 8, 20)), 60], // Date real de Excel
  ["Jose", "no es una fecha", 30], // no se puede interpretar
]));
const colFecha = r6.columnas.find((c) => c.key === "fecha");
assert.strictEqual(colFecha.tipo, "fecha", "mayoria de valores son fecha interpretable");
assert.strictEqual(colFecha.sospechosa, true, "el valor no interpretable marca la columna sospechosa");
assert.strictEqual(r6.filas[0].fecha, "2026-09-01");
assert.strictEqual(r6.filas[1].fecha, "2026-09-05", "dd/mm/aaaa se interpreta dia primero (convencion LatAm)");
assert.strictEqual(r6.filas[2].fecha, "2026-09-13");
assert.strictEqual(r6.filas[3].fecha, "2026-09-09", "mes en palabras, abreviado");
assert.strictEqual(r6.filas[4].fecha, "2026-09-20", "Date real de Excel tambien se estandariza al mismo formato");
assert.strictEqual(r6.filas[5].fecha, "no es una fecha", "lo no interpretable se deja tal cual, no se inventa");

console.log("OK: test-excel-parser (todas las aserciones pasaron)");
