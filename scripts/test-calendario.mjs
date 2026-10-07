// node scripts/test-calendario.mjs
import assert from "node:assert";
import { agruparPorDia } from "../src/lib/calendario.ts";

const filas = [
  { f: "2026-10-05T14:30:00.000Z", p: "Corte de cabello", c: "Ana", m: 35 },
  { f: "2026-10-05T09:00:00.000Z", p: "Manicure", c: "Lucía", m: 20 },
  { f: "2026-10-12", p: "Masaje", c: null, m: null }, // sin hora (medianoche) -> hora null
  { f: "2026-11-01T10:00:00.000Z", p: "Fuera de mes", c: null, m: null }, // otro mes, se ignora
  { f: null, p: "Sin fecha", c: null, m: null }, // sin fecha, se ignora
];

const porDia = agruparPorDia(filas, 2026, 10);

assert.strictEqual(porDia.size, 2, "solo 2 días con entradas en octubre");
const dia5 = porDia.get(5);
assert.strictEqual(dia5.length, 2);
// ordenado por hora: 09:00 antes que 14:30
assert.strictEqual(dia5[0].hora, "09:00");
assert.strictEqual(dia5[0].producto, "Manicure");
assert.strictEqual(dia5[1].hora, "14:30");
assert.strictEqual(dia5[1].monto, 35);

const dia12 = porDia.get(12);
assert.strictEqual(dia12.length, 1);
assert.strictEqual(dia12[0].hora, null, "fecha sin hora (medianoche) no muestra hora");
assert.strictEqual(dia12[0].cliente, null);

assert.strictEqual(porDia.get(1), undefined, "noviembre no entra en el mes de octubre");

console.log("OK: test-calendario (todas las aserciones pasaron)");
