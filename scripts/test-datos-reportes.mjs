// node scripts/test-datos-reportes.mjs
import assert from "node:assert";
import { resumenParaIA } from "../src/lib/datosReportes.ts";

// Sin módulos, no se manda nada raro a la IA
assert.strictEqual(resumenParaIA([]), "Todavía no hay módulos con suficientes datos para reportar.");

const modulos = [
  {
    nombre: "Ventas",
    flujoCaja: { ventas: 354, costos: 150, igv: 54, gananciaBruta: 204, gananciaNeta: 150 },
    totalesPorMes: null,
    sumaTotal: null,
    topProducto: [{ clave: "Zelda", total: 236, veces: 1 }],
    topCliente: null,
    metas: [{ id: "x", producto: "Zelda", objetivo: 5, vendidos: 1, faltan: 4, porcentaje: 20, alcanzada: false }],
  },
];
const resumen = resumenParaIA(modulos);
assert.ok(resumen.includes('Módulo "Ventas"'));
assert.ok(resumen.includes("Ganancia neta: S/ 150"));
assert.ok(resumen.includes("Zelda"));
assert.ok(resumen.includes("1/5")); // vendidos/objetivo de la meta
assert.ok(!resumen.includes("lograda"), "no dice 'lograda' si la meta no se alcanzó");

console.log("OK: test-datos-reportes (todas las aserciones pasaron)");
