// Prueba el parser contra un Excel real, sin necesidad de levantar la app.
// Uso: node scripts/probar-excel-real.mjs "C:\ruta\al\archivo.xlsx" ["Nombre de hoja"]
import * as XLSX from "xlsx";
import fs from "node:fs";
import { sugerirRoles } from "../src/lib/roles.ts";

const ruta = process.argv[2];
const hojaPedida = process.argv[3];
if (!ruta) {
  console.error('Uso: node scripts/probar-excel-real.mjs <ruta-al-excel> ["Nombre de hoja"]');
  process.exit(1);
}

function aKey(label, usados) {
  let key = label.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) key = "columna";
  let final = key, i = 2;
  while (usados.has(final)) { final = `${key}_${i}`; i++; }
  usados.add(final);
  return final;
}

function inferirTipo(valores) {
  const conValor = valores.filter((v) => v !== null && v !== undefined && v !== "");
  if (conValor.length === 0) return "texto (sin datos para inferir)";
  if (conValor.every((v) => v instanceof Date)) return "fecha";
  if (conValor.every((v) => typeof v === "number")) return "numero";
  return "texto";
}

const buffer = fs.readFileSync(ruta);
const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

const nombreHoja = hojaPedida ?? workbook.SheetNames[0];
if (hojaPedida && !workbook.SheetNames.includes(hojaPedida)) {
  console.error(`No existe la hoja "${hojaPedida}". Hojas disponibles: ${workbook.SheetNames.join(", ")}`);
  process.exit(1);
}

console.log(`\nArchivo: ${ruta}`);
console.log(`Hojas encontradas: ${workbook.SheetNames.join(", ")}`);
console.log(`(usando la hoja: "${nombreHoja}"${hojaPedida ? "" : " -- la primera; pasá el nombre de otra hoja como 2do argumento para probarla"})\n`);

const hoja = workbook.Sheets[nombreHoja];
const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, blankrows: false });

if (filasCrudas.length === 0) {
  console.error("ALERTA: el archivo/hoja está vacío.");
  process.exit(1);
}

const encabezados = filasCrudas[0].map((h) => (h === null ? "" : String(h)));
const filasDatos = filasCrudas.slice(1);

const vacias = encabezados.filter((h) => h.trim() === "").length;
if (vacias > 0) {
  console.log(`ALERTA: ${vacias} columna(s) sin encabezado — se van a ignorar. Revisá si tenían datos importantes.`);
}

function pareceValorDeDato(v) {
  return typeof v === "number" || v instanceof Date;
}

const usados = new Set();
const columnas = encabezados
  .map((label, idx) => ({ label: label.trim(), idx }))
  .filter((c) => c.label !== "")
  .map(({ label, idx }) => {
    const valores = filasDatos.map((f) => f[idx]);
    const tipo = inferirTipo(valores);
    const sospechosa = pareceValorDeDato(filasCrudas[0][idx]);
    return { key: aKey(label, usados), label, tipo, sospechosa, ejemplo: valores.find((v) => v !== null && v !== "") };
  });
if (columnas.length === 1) columnas[0].sospechosa = true;
const roles = sugerirRoles(columnas);

console.log("Columnas detectadas:\n");
columnas.forEach((c) => {
  const alerta = c.sospechosa ? "  [SOSPECHOSA: el titulo parece un dato, no un nombre real]" : "";
  const rol = roles[c.key] ? `  |  rol sugerido: ${roles[c.key]}` : "";
  console.log(`  - "${c.label}"  ->  key: ${c.key}  |  tipo: ${c.tipo}${rol}  |  ejemplo: ${JSON.stringify(c.ejemplo)}${alerta}`);
});

const filasConDatos = filasDatos.filter((f) => f.some((v) => v !== null && v !== undefined && v !== ""));
console.log(`\nFilas totales en el archivo: ${filasDatos.length}`);
console.log(`Filas con datos (las que se importarían): ${filasConDatos.length}`);
if (filasDatos.length !== filasConDatos.length) {
  console.log(`  (${filasDatos.length - filasConDatos.length} filas vacías se descartan automáticamente, es esperado)`);
}

console.log("\nAlertas de calidad a revisar a mano:");
const tiposTexto = columnas.filter((c) => c.tipo === "texto").map((c) => c.label);
if (tiposTexto.length) {
  console.log(`  - Estas columnas se van a guardar como texto libre (revisá si alguna debería ser número/fecha y el Excel tiene datos mezclados): ${tiposTexto.join(", ")}`);
}
console.log("\nListo. Si algo de esto se ve mal, ese es el ajuste que hay que hacerle al parser antes de mostrárselo a un cliente real.\n");
