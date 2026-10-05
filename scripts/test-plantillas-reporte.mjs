// node scripts/test-plantillas-reporte.mjs
import assert from "node:assert";
import { plantillasCubiertas, rolesFaltantes, PLANTILLAS_REPORTE } from "../src/lib/plantillasReporte.ts";

const idsDe = (lista) => lista.map((p) => p.id).sort();

// Monto + fecha: ventas mensuales, NO total_simple (ese es el caso sin fecha)
assert.deepStrictEqual(idsDe(plantillasCubiertas(["monto", "fecha"])), ["ventas_mensuales"]);

// Monto solo (sin fecha, sin costo): total_simple
assert.deepStrictEqual(idsDe(plantillasCubiertas(["monto"])), ["total_simple"]);

// Monto + costo (sin fecha): flujo_caja, NO total_simple (mismo motivo que en /api/reportes)
assert.deepStrictEqual(idsDe(plantillasCubiertas(["monto", "costo"])), ["flujo_caja"]);

// Monto + costo + fecha: flujo_caja Y ventas_mensuales (no son excluyentes entre sí)
assert.deepStrictEqual(idsDe(plantillasCubiertas(["monto", "costo", "fecha"])), ["flujo_caja", "ventas_mensuales"]);

// Producto y cliente activan sus propios rankings, independientes del resto
assert.deepStrictEqual(idsDe(plantillasCubiertas(["producto", "cliente"])), ["top_clientes", "top_productos"]);

// Sin nada marcado, ninguna plantilla
assert.deepStrictEqual(plantillasCubiertas([]), []);
assert.deepStrictEqual(plantillasCubiertas([null, "", null]), []);

// rolesFaltantes: qué le falta a flujo_caja si solo hay monto
const flujoCaja = PLANTILLAS_REPORTE.find((p) => p.id === "flujo_caja");
assert.deepStrictEqual(rolesFaltantes(flujoCaja, ["monto"]), ["costo"]);
assert.deepStrictEqual(rolesFaltantes(flujoCaja, ["monto", "costo"]), []);

console.log("OK: test-plantillas-reporte (todas las aserciones pasaron)");
