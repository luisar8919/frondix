// Chequeo del catalogo de recomendaciones: node scripts/test-patrones-recomendacion.mjs
import assert from "node:assert";
import { sugerirRecomendacion } from "../src/lib/patronesRecomendacion.ts";

const base = { datasetId: "d1", nombre: "Ventas", plantillas: [], totalesPorMes: null, topProducto: null, topCliente: null, topProveedor: null, sumaTotal: null, sumaGastos: null, flujoCaja: null, metas: null };

// --- sin ningun patron aplicable: no inventa nada ---
assert.strictEqual(sugerirRecomendacion([{ ...base }]), null, "sin señales, no sugiere nada");

// --- ganancia negativa gana prioridad sobre cualquier otra cosa ---
const r1 = sugerirRecomendacion([{ ...base, flujoCaja: { ventas: 100, costos: 150, igv: 0, gananciaBruta: -50, gananciaNeta: -50 } }]);
assert.strictEqual(r1.patronId, "ganancia_negativa");
assert.match(r1.texto, /costos ya superan tus ventas/, "detecta ganancia neta negativa");

// --- caida de ventas mes a mes ---
const r2 = sugerirRecomendacion([{ ...base, totalesPorMes: [{ mes: "2026-08", total: 1000, registros: 10 }, { mes: "2026-09", total: 400, registros: 4 }] }]);
assert.strictEqual(r2.patronId, "tendencia_caida");
assert.match(r2.texto, /bajaron 60%/, "60% de caida respecto al mes anterior");

// --- sin caida fuerte, no dispara ---
assert.strictEqual(
  sugerirRecomendacion([{ ...base, totalesPorMes: [{ mes: "2026-08", total: 1000, registros: 10 }, { mes: "2026-09", total: 900, registros: 9 }] }]),
  null,
  "una baja de solo 10% no es suficiente para disparar el patron"
);

// --- un producto concentra la mayoria de las ventas ---
const r3 = sugerirRecomendacion([{ ...base, topProducto: [{ clave: "Mouse", total: 800, veces: 20 }, { clave: "Teclado", total: 100, veces: 5 }, { clave: "Cable", total: 100, veces: 3 }] }]);
assert.strictEqual(r3.patronId, "concentracion_producto");
assert.match(r3.texto, /un solo producto \(Mouse\)/, "80% de concentracion en un producto dispara el patron");

// --- meta cerca de cumplirse ---
const r4 = sugerirRecomendacion([{ ...base, metas: [{ id: "m1", producto: "Mouse", objetivo: 100, vendidos: 85, faltan: 15, porcentaje: 85, alcanzada: false }] }]);
assert.strictEqual(r4.patronId, "meta_cerca");
assert.match(r4.texto, /meta de "Mouse".*85%/, "meta al 85% sin alcanzar dispara el patron");

// --- meta ya alcanzada no dispara nada ---
assert.strictEqual(
  sugerirRecomendacion([{ ...base, metas: [{ id: "m1", producto: "Mouse", objetivo: 100, vendidos: 100, faltan: 0, porcentaje: 100, alcanzada: true }] }]),
  null,
  "una meta ya alcanzada no es una recomendacion pendiente"
);

// --- gastos altos respecto a ventas ---
const r5 = sugerirRecomendacion([{ ...base, sumaTotal: 1000, sumaGastos: 300 }]);
assert.strictEqual(r5.patronId, "gastos_altos");
assert.match(r5.texto, /30% de tus ventas/, "gastos en 30% de las ventas dispara el patron");

console.log("OK: test-patrones-recomendacion (todas las aserciones pasaron)");
