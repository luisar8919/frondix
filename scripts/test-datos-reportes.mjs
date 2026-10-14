// node scripts/test-datos-reportes.mjs
import assert from "node:assert";
import { resumenParaIA, huellaModulos } from "../src/lib/datosReportes.ts";

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

// --- huellaModulos: la decide la plataforma, no la IA ---
assert.strictEqual(huellaModulos(modulos), huellaModulos(modulos), "misma data, misma huella");

const modulosCambiados = [{ ...modulos[0], flujoCaja: { ...modulos[0].flujoCaja, ventas: 999 } }];
assert.notStrictEqual(huellaModulos(modulos), huellaModulos(modulosCambiados), "cambia un numero real, cambia la huella");

// Cambiar solo el id (aleatorio) de una meta NO debe cambiar la huella -- no es un dato real
const modulosOtroId = [{ ...modulos[0], metas: [{ ...modulos[0].metas[0], id: "y" }] }];
assert.strictEqual(huellaModulos(modulos), huellaModulos(modulosOtroId), "el id de la meta no afecta la huella");

console.log("OK: test-datos-reportes (todas las aserciones pasaron)");
