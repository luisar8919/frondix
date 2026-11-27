// node scripts/test-reportes.mjs
import assert from "node:assert";
import { totalesPorMes, topPor, sumaMonto, flujoCaja, progresoMetas, recortarMesesSinDatos, promedioDiarioPorProducto, fechasDistintas, variacionMensual } from "../src/lib/reportes.ts";

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

// --- recortarMesesSinDatos: recien cargado, sin meses anteriores vacios de relleno ---
const ceroR = { total: 0, registros: 0 };
const conR = (n) => ({ total: n, registros: 1 });
const recortado = recortarMesesSinDatos([
  { mes: "2026-04", ...ceroR }, { mes: "2026-05", ...ceroR }, { mes: "2026-06", ...ceroR },
  { mes: "2026-07", ...conR(100) }, { mes: "2026-08", ...ceroR }, { mes: "2026-09", ...conR(50) },
]);
assert.deepStrictEqual(recortado.map((m) => m.mes), ["2026-07", "2026-08", "2026-09"], "corta antes del primer mes con datos, pero conserva ceros intermedios reales");

// el primer mes YA tiene datos: no hay nada que recortar
const sinRecorte = [{ mes: "2026-09", ...conR(50) }];
assert.deepStrictEqual(recortarMesesSinDatos(sinRecorte), sinRecorte);

// todo en cero: no hay de donde partir, se deja igual (no se inventa un recorte)
const todoCero = [{ mes: "2026-08", ...ceroR }, { mes: "2026-09", ...ceroR }];
assert.deepStrictEqual(recortarMesesSinDatos(todoCero), todoCero);

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

// --- flujoCaja ---
// Ventas con IGV incluido: 118 = 100 neto + 18 de IGV
const conIgv = flujoCaja([{ m: 118, costo: 50 }], true);
assert.deepStrictEqual(conIgv, { ventas: 118, costos: 50, igv: 18, gananciaBruta: 68, gananciaNeta: 50 });

// Ventas sin IGV incluido: el IGV se suma aparte, no se resta de la ganancia
const sinIgv = flujoCaja([{ m: 100, costo: 50 }], false);
assert.deepStrictEqual(sinIgv, { ventas: 100, costos: 50, igv: 18, gananciaBruta: 50, gananciaNeta: 50 });

// Sin costos cargados, costos queda en 0 (no rompe el cálculo)
const sinCostos = flujoCaja([{ m: 100 }], false);
assert.strictEqual(sinCostos.costos, 0);
assert.strictEqual(sinCostos.gananciaBruta, 100);

// --- progresoMetas ---
const ventasProductos = [
  { clave: "Mario Kart" }, { clave: "Mario Kart" }, { clave: "Mario Kart" },
  { clave: "Zelda" },
];
const progreso = progresoMetas(ventasProductos, [
  { producto: "Mario Kart", cantidadObjetivo: 5 },
  { producto: "Zelda", cantidadObjetivo: 1 },
  { producto: "Metroid", cantidadObjetivo: 3 }, // sin ventas todavía
]);
assert.deepStrictEqual(progreso[0], { producto: "Mario Kart", objetivo: 5, vendidos: 3, faltan: 2, porcentaje: 60, alcanzada: false });
assert.deepStrictEqual(progreso[1], { producto: "Zelda", objetivo: 1, vendidos: 1, faltan: 0, porcentaje: 100, alcanzada: true });
assert.deepStrictEqual(progreso[2], { producto: "Metroid", objetivo: 3, vendidos: 0, faltan: 3, porcentaje: 0, alcanzada: false });

// superar la meta no pasa de 100%
const superada = progresoMetas([{ clave: "A" }, { clave: "A" }, { clave: "A" }], [{ producto: "A", cantidadObjetivo: 2 }]);
assert.strictEqual(superada[0].porcentaje, 100);
assert.strictEqual(superada[0].alcanzada, true);

// --- fechasDistintas / promedioDiarioPorProducto ---
const ventasConFecha = [
  { f: "2026-09-01", clave: "Pollo", cantidad: 3 },
  { f: "2026-09-01", clave: "Gaseosa", cantidad: 2 },
  { f: "2026-09-02", clave: "Pollo", cantidad: 1 },
  { f: "2026-09-03", clave: "Pollo", cantidad: 2 }, // sin "cantidad" para Gaseosa este día -> no cuenta
];
assert.strictEqual(fechasDistintas(ventasConFecha), 3, "3 fechas de calendario distintas (01, 02, 03)");
const dias = fechasDistintas(ventasConFecha);
const promedio = promedioDiarioPorProducto(ventasConFecha, dias);
assert.deepStrictEqual(promedio[0], { clave: "Pollo", totalUnidades: 6, promedioDiario: 2 }, "6 unidades / 3 dias = 2 por dia");
assert.strictEqual(promedio[1].clave, "Gaseosa");
assert.strictEqual(promedio[1].totalUnidades, 2, "2 unidades, solo vendida el dia 1, pero el denominador sigue siendo los 3 dias del modulo entero");
assert.strictEqual(promedioDiarioPorProducto([], 0).length, 0, "sin dias con datos, no hay division por 0");

// Sin columna "Cantidad" marcada, cada fila cuenta como 1 unidad
const sinCantidad = promedioDiarioPorProducto([{ f: "2026-09-01", clave: "Mesa 3" }, { f: "2026-09-01", clave: "Mesa 3" }], 1);
assert.strictEqual(sinCantidad[0].totalUnidades, 2);

// --- variacionMensual ---
const mesesParaVariacion = totalesPorMes([{ f: "2026-08-01", m: 100 }, { f: "2026-09-01", m: 150 }], ahora, 2);
const conVariacion = variacionMensual(mesesParaVariacion);
assert.strictEqual(conVariacion[0].variacionPct, null, "el primer mes del arreglo no tiene mes anterior con que comparar");
assert.strictEqual(conVariacion[1].variacionPct, 50, "de 100 a 150 es +50%");
const sinVentasAntes = variacionMensual(totalesPorMes([{ f: "2026-09-01", m: 100 }], ahora, 2));
assert.strictEqual(sinVentasAntes[1].variacionPct, null, "el mes anterior no tuvo ventas (total 0), no hay con que comparar");

console.log("OK: test-reportes (todas las aserciones pasaron)");
