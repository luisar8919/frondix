// Chequeo mínimo del parser: node scripts/test-excel-parser.mjs
// (usa el .mjs compilado a mano porque el proyecto es TS puro sin build previo;
// si preferís correrlo tal cual TS, usar `npx tsx scripts/test-excel-parser.mjs`)
import assert from "node:assert";
import * as XLSX from "xlsx";

function aKey(label, usados) {
  let key = label
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) key = "columna";
  let final = key;
  let i = 2;
  while (usados.has(final)) {
    final = `${key}_${i}`;
    i++;
  }
  usados.add(final);
  return final;
}

function inferirTipo(valores) {
  const conValor = valores.filter((v) => v !== null && v !== undefined && v !== "");
  if (conValor.length === 0) return "texto";
  if (conValor.every((v) => v instanceof Date)) return "fecha";
  if (conValor.every((v) => typeof v === "number")) return "numero";
  return "texto";
}

function pareceValorDeDato(v) {
  return typeof v === "number" || v instanceof Date;
}

function parsearExcel(buffer, renombres) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, blankrows: false });
  const filaEncabezados = filasCrudas[0];
  const encabezados = filaEncabezados.map((h) => (h === null ? "" : String(h)));
  const filasDatos = filasCrudas.slice(1);
  const usados = new Set();
  const columnasConIndice = encabezados
    .map((label, idxOriginal) => ({ label: label.trim(), idxOriginal }))
    .filter((c) => c.label !== "");
  const columnas = columnasConIndice.map(({ label, idxOriginal }) => {
    const key = aKey(label, usados);
    return {
      key,
      label: renombres?.[key] ?? label,
      tipo: inferirTipo(filasDatos.map((f) => f[idxOriginal])),
      sospechosa: pareceValorDeDato(filaEncabezados[idxOriginal]),
      idxOriginal,
    };
  });
  if (columnas.length === 1) columnas[0].sospechosa = true;
  const filas = filasDatos
    .filter((fila) => fila.some((v) => v !== null && v !== undefined && v !== ""))
    .map((fila) => {
      const registro = {};
      columnas.forEach((col) => (registro[col.key] = fila[col.idxOriginal] ?? null));
      return registro;
    });
  return { columnas: columnas.map(({ key, label, tipo, sospechosa }) => ({ key, label, tipo, sospechosa })), filas };
}

// --- caso 1: columnas mixtas, con tildes y una columna vacía ---
const ws1 = XLSX.utils.aoa_to_sheet([
  ["Nombre Cliente", "Teléfono", "", "Monto"],
  ["Ana Pérez", "987654321", null, 150.5],
  ["Luis Ramírez", "912345678", null, 200],
]);
const wb1 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb1, ws1, "Hoja1");
const buffer1 = XLSX.write(wb1, { type: "array", bookType: "xlsx" });

const r1 = parsearExcel(buffer1);
assert.deepStrictEqual(
  r1.columnas.map((c) => c.key),
  ["nombre_cliente", "telefono", "monto"],
  "debe generar keys sin tildes y saltear la columna sin encabezado"
);
assert.strictEqual(r1.columnas.find((c) => c.key === "monto").tipo, "numero");
assert.strictEqual(r1.columnas.find((c) => c.key === "nombre_cliente").tipo, "texto");
assert.strictEqual(r1.filas.length, 2, "debe leer las 2 filas de datos");
assert.strictEqual(r1.filas[0].nombre_cliente, "Ana Pérez");

// --- caso 2: encabezados duplicados no deben pisarse ---
const ws2 = XLSX.utils.aoa_to_sheet([
  ["Nombre", "Nombre"],
  ["A", "B"],
]);
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, ws2, "Hoja1");
const buffer2 = XLSX.write(wb2, { type: "array", bookType: "xlsx" });
const r2 = parsearExcel(buffer2);
assert.deepStrictEqual(r2.columnas.map((c) => c.key), ["nombre", "nombre_2"]);

// --- caso 3: encabezado "roto" (el título de una columna es en realidad un
// dato: una fecha y un número), como la hoja "Caja Dic" del Excel real ---
const ws3 = XLSX.utils.aoa_to_sheet([
  ["Concepto", "Entrada", new Date("2026-01-05"), 320],
  ["Ventas", 620, new Date("2026-01-10"), 215],
]);
const wb3 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb3, ws3, "Hoja1");
const buffer3 = XLSX.write(wb3, { type: "array", bookType: "xlsx", cellDates: true });
const r3 = parsearExcel(buffer3);
assert.strictEqual(r3.columnas.find((c) => c.key === "concepto").sospechosa, false, "un título normal no debe marcarse sospechoso");
assert.strictEqual(r3.columnas.filter((c) => c.sospechosa).length, 2, "las 2 columnas cuyo título es fecha/número deben marcarse sospechosas");

// --- caso 4: una sola columna (lista sin encabezado, como la hoja "Stock") ---
const ws4 = XLSX.utils.aoa_to_sheet([["Resident Evil 7"], ["Resident Evil 2 Remake"]]);
const wb4 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb4, ws4, "Hoja1");
const buffer4 = XLSX.write(wb4, { type: "array", bookType: "xlsx" });
const r4 = parsearExcel(buffer4);
assert.strictEqual(r4.columnas[0].sospechosa, true, "una sola columna detectada siempre debe pedir confirmación");

// --- caso 5: renombres pisa el label sin romper la key ni los datos ---
const colNumeroSospechosa = r3.columnas.find((c) => c.sospechosa && c.tipo === "numero");
assert.ok(colNumeroSospechosa, "debe existir la columna numérica sospechosa para probar el renombre");
const r5 = parsearExcel(buffer3, { [colNumeroSospechosa.key]: "Compras" });
assert.strictEqual(r5.columnas.find((c) => c.key === colNumeroSospechosa.key).label, "Compras");
assert.strictEqual(r5.filas.length, r3.filas.length, "renombrar no debe cambiar las filas importadas");

console.log("OK: test-excel-parser (%d aserciones pasaron)", 12);
