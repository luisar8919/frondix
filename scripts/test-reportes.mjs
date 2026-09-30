// node scripts/test-reportes.mjs
import assert from "node:assert";
import { totalesPorMes, topPor, sumaMonto } from "../src/lib/reportes.ts";

const ahora = new Date("2026-09-25T15:00:00Z"); // "hoy" para las pruebas

// --- totalesPorMes ---
const filas = [
  { f: "2026-09-01", m: 100 },
  { f: "2026-09-15", m: "50.5" }, // monto como texto
  { f: "2026-08-10", m: 200 },
  { f: "2026-07-01", m: 999 }, // queda fuera del rango de 2 meses
  { f: "2026-09-20", m: "abc" }, // monto invalido: se ignora
  { f: null, m: 500 }, // sin fecha: se ignora
];
const meses = totalesPorMes(filas, ahora, 2);
assert.deepStrictEqual(meses.map((m) => m.mes), ["2026-08", "2026-09"], "del mas viejo al mas nuevo");
assert.deepStrictEqual(meses[1], { mes: "2026-09", total: 150.5, registros: 2 });
assert.deepStrictEqual(meses[0], { mes: "2026-08", total: 200, registros: 1 });

// mes sin ningun dato queda en cero, no se salta
const soloUnMes = totalesPorMes([{ f: "2026-09-01", m: 10 }], ahora, 3);
assert.deepStrictEqual(soloUnMes.map((m) => m.mes), ["2026-07", "2026-08", "2026-09"]);
assert.deepStrictEqual(soloUnMes[0], { mes: "2026-07", total: 0, registros: 0 });

assert.deepStrictEqual(totalesPorMes([], ahora, 1), [{ mes: "2026-09", total: 0, registros: 0 }]);

// --- topPor ---
const ventas = [
  { clave: "Zelda", m: 200 },
  { clave: "Zelda", m: 100 },
  { clave: "Mario", m: 50 },
  { clave: " mario ", m: 50 }, // mismo texto con espacios: NO se junta (a diferencia de seguimiento, no normaliza mayus/tildes)
  { clave: null, m: 999 }, // sin clave: se ignora
  { clave: "Metroid", m: "abc" }, // monto invalido, igual cuenta la aparicion
];
const top = topPor(ventas, 5);
assert.deepStrictEqual(top[0], { clave: "Zelda", total: 300, veces: 2 }, "ordena por monto sumado cuando hay montos");
assert.strictEqual(top.length, 4, "'Mario' y 'mario' (de ' mario ' recortado) cuentan como claves distintas: Zelda, Mario, mario, Metroid");

// sin ningun monto valido, ordena por cantidad de apariciones
const visitas = [{ clave: "Ana" }, { clave: "Ana" }, { clave: "Luis" }];
const topSinMonto = topPor(visitas, 5);
assert.deepStrictEqual(topSinMonto[0], { clave: "Ana", total: 0, veces: 2 });

assert.deepStrictEqual(topPor([], 5), []);
assert.strictEqual(topPor([{ clave: "A", m: 1 }, { clave: "B", m: 2 }, { clave: "C", m: 3 }], 2).length, 2, "respeta el limite n");

// --- sumaMonto (caso "caja": monto sin fecha) ---
assert.strictEqual(sumaMonto([{ m: 100 }, { m: "50.5" }, { m: "abc" }, { m: null }]), 150.5);
assert.strictEqual(sumaMonto([]), 0);

console.log("OK: test-reportes (todas las aserciones pasaron)");
