// Chequeo del motor de Reglas: node scripts/test-reglas.mjs
// condicionCumple() decide si CADA regla de un módulo se dispara o no en cada
// alta/edición/baja de un registro -- un bug acá afecta ajuste de Stock,
// notificaciones, exclusión de Reportes, etc. al mismo tiempo, en producción,
// sin que se note hasta que alguien revisa un número que no cuadra.
import assert from "node:assert";
import { condicionCumple } from "../src/lib/reglas.ts";

// --- "siempre" ---
assert.strictEqual(condicionCumple({ tipo: "siempre" }, {}), true);
assert.strictEqual(condicionCumple({ tipo: "siempre" }, { cualquiera: "cosa" }), true, "siempre ignora los datos");

// --- "estado" (legado): compara como texto, recortando espacios ---
assert.strictEqual(condicionCumple({ tipo: "estado", columnaKey: "estado", valor: "Cancelado" }, { estado: "Cancelado" }), true);
assert.strictEqual(condicionCumple({ tipo: "estado", columnaKey: "estado", valor: "Cancelado" }, { estado: " Cancelado " }), true, "recorta espacios de más");
assert.strictEqual(condicionCumple({ tipo: "estado", columnaKey: "estado", valor: "Cancelado" }, { estado: "Pendiente" }), false);
assert.strictEqual(condicionCumple({ tipo: "estado", columnaKey: "estado", valor: "x" }, {}), false, "campo ausente nunca matchea");

// --- "campo" + operador "es"/"no_es": comparación de texto, nunca numérica ---
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "e", operador: "es", valor: "Confirmada" }, { e: "Confirmada" }), true);
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "e", operador: "no_es", valor: "Confirmada" }, { e: "Pendiente" }), true);
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "e", operador: "es", valor: "10" }, { e: 10 }), true, "10 numérico === \"10\" como texto");

// --- operadores numéricos: dato sucio nunca dispara, nunca explota ---
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "monto", operador: "mayor", valor: "500" }, { monto: 600 }), true);
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "monto", operador: "mayor", valor: "500" }, { monto: 500 }), false, "mayor estricto");
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "monto", operador: "mayor_igual", valor: "500" }, { monto: 500 }), true);
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "monto", operador: "menor", valor: "10" }, { monto: 5 }), true);
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "monto", operador: "menor_igual", valor: "10" }, { monto: 10 }), true);
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "monto", operador: "mayor", valor: "500" }, { monto: "no es un número" }), false, "texto sucio en el dato: no dispara, no tira error");
assert.strictEqual(condicionCumple({ tipo: "campo", columnaKey: "monto", operador: "mayor", valor: "no es un número" }, { monto: 999 }), false, "umbral sucio tampoco dispara");

// --- compararColumnaKey: compara contra OTRO campo del mismo registro, no un valor fijo ---
assert.strictEqual(
  condicionCumple({ tipo: "campo", columnaKey: "cantidad", operador: "menor_igual", valor: "", compararColumnaKey: "stock_minimo" }, { cantidad: 3, stock_minimo: 5 }),
  true,
  "Stock bajo: cantidad <= stock mínimo"
);
assert.strictEqual(
  condicionCumple({ tipo: "campo", columnaKey: "cantidad", operador: "menor_igual", valor: "999", compararColumnaKey: "stock_minimo" }, { cantidad: 10, stock_minimo: 5 }),
  false,
  "con stock de sobra no dispara, aunque \"valor\" (ignorado acá) diga otra cosa"
);

console.log("OK: test-reglas (todas las aserciones pasaron)");
