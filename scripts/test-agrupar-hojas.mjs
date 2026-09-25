// Chequeo del agrupador: node scripts/test-agrupar-hojas.mjs
import assert from "node:assert";
import * as XLSX from "xlsx";

function aKey(label, usados) {
  let key = label.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) key = "columna";
  let final = key, i = 2;
  while (usados.has(final)) { final = `${key}_${i}`; i++; }
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

function parsearHoja(workbook, nombreHoja) {
  const hoja = workbook.Sheets[nombreHoja];
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, blankrows: false });
  if (filasCrudas.length === 0) return { columnas: [], filas: [] };
  const encabezados = filasCrudas[0].map((h) => (h === null ? "" : String(h)));
  const filasDatos = filasCrudas.slice(1);
  const usados = new Set();
  const columnas = encabezados
    .map((label, idx) => ({ label: label.trim(), idx }))
    .filter((c) => c.label !== "")
    .map(({ label, idx }) => ({ key: aKey(label, usados), label, tipo: inferirTipo(filasDatos.map((f) => f[idx])), idx }));
  const filas = filasDatos
    .filter((f) => f.some((v) => v !== null && v !== undefined && v !== ""))
    .map((f) => {
      const r = {};
      columnas.forEach((c) => (r[c.key] = f[c.idx] ?? null));
      return r;
    });
  return { columnas: columnas.map(({ key, label, tipo }) => ({ key, label, tipo })), filas };
}

function mismaFamilia(a, b) {
  const chica = a.size <= b.size ? a : b;
  const grande = a.size <= b.size ? b : a;
  if (chica.size === 0) return false;
  let comunes = 0;
  for (const k of chica) if (grande.has(k)) comunes++;
  return comunes / chica.size >= 0.7;
}

function agruparHojas(workbook, maxGrupos = 3) {
  const hojas = [];
  for (const nombre of workbook.SheetNames) {
    const { columnas, filas } = parsearHoja(workbook, nombre);
    if (columnas.length > 0 && filas.length > 0) hojas.push({ nombre, columnas, filas });
  }
  hojas.sort((a, b) => b.columnas.length - a.columnas.length);
  const grupos = [];
  for (const hoja of hojas) {
    const keysHoja = new Set(hoja.columnas.map((c) => c.key));
    const grupo = grupos.find((g) => mismaFamilia(keysHoja, new Set(g[0].columnas.map((c) => c.key))));
    if (grupo) grupo.push(hoja); else grupos.push([hoja]);
  }
  grupos.sort((a, b) => b.reduce((s, h) => s + h.filas.length, 0) - a.reduce((s, h) => s + h.filas.length, 0));
  const finales = grupos.slice(0, maxGrupos);
  const omitidas = grupos.slice(maxGrupos).flatMap((g) => g.map((h) => h.nombre));
  const resultado = finales.map((grupo) => {
    const canonica = grupo[0];
    const filas = grupo.flatMap((h) => h.filas.map((f) => {
      const r = {};
      canonica.columnas.forEach((c) => (r[c.key] = f[c.key] ?? null));
      return r;
    }));
    return { hojas: grupo.map((h) => h.nombre), columnas: canonica.columnas, filas };
  });
  return { grupos: resultado, hojasOmitidas: omitidas };
}

// --- caso: 2 familias claras + 1 hoja suelta, más columnas primero ---
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["Juegos", "Consola", "Costo", "Edad", "Lugar"],
  ["Mario", "Wii", 70, "25-34", "SM"],
]), "Noviembre"); // 5 columnas
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["Juegos", "Consola", "Venta", "Costo", "Ganancia", "Ajuste Precio", "Edad", "Lugar"],
  ["SMT V", "Switch", 60, 0, 60, "No", "25-34", "SM"],
  ["Balatro", "Switch", 120, 70, 50, "No", "18-24", "RP"],
]), "Diciembre"); // 8 columnas (superset de Noviembre)
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["Concepto", "Entrada"],
  ["Ventas", 620],
]), "Caja Nov"); // otra familia, sin relación
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Stock"], ["Mario"]]), "Suelta1");

const { grupos, hojasOmitidas } = agruparHojas(wb, 3);

assert.strictEqual(grupos.length, 3, "debe formar como máximo 3 grupos");
const grupoVentas = grupos.find((g) => g.hojas.includes("Diciembre"));
assert.ok(grupoVentas, "Diciembre debe estar en un grupo");
assert.ok(grupoVentas.hojas.includes("Noviembre"), "Noviembre debe agruparse con Diciembre (misma familia, menos columnas)");
assert.strictEqual(grupoVentas.columnas.length, 8, "el esquema del grupo debe ser el de más columnas (Diciembre)");
assert.strictEqual(grupoVentas.filas.length, 3, "debe traer las filas de ambas hojas del grupo");
assert.strictEqual(grupoVentas.filas.find((f) => f.juegos === "Mario").ganancia, null, "a Noviembre le faltan columnas de Diciembre, deben quedar null");

const grupoCaja = grupos.find((g) => g.hojas.includes("Caja Nov"));
assert.ok(grupoCaja, "Caja Nov debe quedar en su propio grupo (familia distinta)");
assert.strictEqual(grupoCaja.hojas.length, 1);

assert.strictEqual(hojasOmitidas.length, 0, "con solo 3 familias no debería omitirse ninguna hoja");

// --- caso: más de 3 familias -> se omiten las de menos datos ---
const wb2 = XLSX.utils.book_new();
["A", "B", "C", "D"].forEach((nombre, i) => {
  const filas = Array.from({ length: (4 - i) * 2 }, (_, j) => [`v${j}`]);
  XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([[`col_${nombre}`], ...filas]), nombre);
});
const r2 = agruparHojas(wb2, 3);
assert.strictEqual(r2.grupos.length, 3, "debe capar a 3 grupos aunque haya 4 familias");
assert.strictEqual(r2.hojasOmitidas.length, 1, "la familia con menos filas debe quedar afuera");
assert.strictEqual(r2.hojasOmitidas[0], "D", "se omite la que tiene menos datos (D, la más chica)");

console.log("OK: test-agrupar-hojas (todas las aserciones pasaron)");
