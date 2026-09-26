// Chequeo del seguimiento de clientes: node scripts/test-seguimiento.mjs
// Importa el codigo real (.ts), sin copiar la logica.
import assert from "node:assert";
import {
  diasDesde, fechaUTC, agruparClientes, formatearNombre, sinVolver, resumenSemana,
  normalizarTelefonoPE, armarMensaje, primerNombre, enlaceWhatsApp, PLANTILLA_POR_DEFECTO,
} from "../src/lib/seguimiento.ts";

// "hoy" = 25-sep-2026 10:00 en Lima (15:00 UTC)
const ahora = new Date("2026-09-25T15:00:00Z");

// --- dias: se cuentan en hora de Lima, no en UTC ---
assert.strictEqual(diasDesde("2026-08-26T00:00:00.000Z", ahora), 30);
assert.strictEqual(diasDesde("2026-09-25", ahora), 0, "hoy = 0 dias");
assert.strictEqual(diasDesde("2026-09-30", ahora), -5, "fecha futura = negativo");
const nocheLima = new Date("2026-09-26T02:00:00Z"); // 21:00 del 25 en Lima, ya es 26 en UTC
assert.strictEqual(diasDesde("2026-09-25", nocheLima), 0, "de noche en Lima sigue siendo el mismo dia");
assert.strictEqual(diasDesde("no es fecha", ahora), null);
assert.strictEqual(fechaUTC(20260925), null, "un numero no es fecha");

// --- agrupar clientes: mismo cliente con mayusculas/tildes/espacios distintos ---
const filas = [
  { c: "Ana Torres", f: "2026-06-01T00:00:00.000Z", t: "987000001" },
  { c: " ana  torres ", f: "2026-08-01T00:00:00.000Z", t: "987111111" },
  { c: "Luis Ramírez", f: "2026-09-20T00:00:00.000Z", t: null },
  { c: "Luis Ramirez", f: "2026-05-10T00:00:00.000Z", t: "987222222" },
  { c: "Sin fecha", f: null, t: "987333333" },
  { c: null, f: "2026-09-01T00:00:00.000Z", t: "987444444" },
  { c: "Carla", f: "2026-01-05", t: "12345" },
];
const clientes = agruparClientes(filas);
const porNombre = Object.fromEntries(clientes.map((c) => [c.clave, c]));
assert.strictEqual(clientes.length, 3, "Ana y Luis se juntan; sin fecha o sin cliente se descartan");
assert.strictEqual(porNombre["ana torres"].visitas, 2);
assert.strictEqual(porNombre["ana torres"].ultimaFecha, "2026-08-01");
assert.strictEqual(porNombre["ana torres"].telefono, "987111111", "usa el telefono de la fecha mas reciente");
assert.strictEqual(porNombre["luis ramirez"].nombre, "Luis Ramírez", "muestra el nombre de la fila mas reciente");
assert.strictEqual(porNombre["luis ramirez"].telefono, "987222222", "si la fila reciente no tiene telefono, usa el que si tiene");

// --- formato de nombres ---
assert.strictEqual(formatearNombre("JUAN  PEREZ"), "Juan Perez");
assert.strictEqual(formatearNombre("maría de la cruz"), "María De La Cruz");
assert.strictEqual(formatearNombre("Ana McDonald"), "Ana McDonald", "un nombre ya bien escrito no se toca");

// --- sin volver: umbral inclusivo y orden ---
const sv = sinVolver(clientes, 30, ahora);
assert.deepStrictEqual(sv.map((c) => c.nombre), ["Carla", "Ana Torres"], "Luis volvio hace 5 dias: no aparece; el mas antiguo va primero");
assert.strictEqual(sv[1].dias, 55);
assert.strictEqual(sinVolver(clientes, 55, ahora).length, 2, "el umbral es 'hace X dias o mas'");
assert.strictEqual(sinVolver(clientes, 300, ahora).length, 0);

// --- resumen semanal ---
const ventas = [
  { f: "2026-09-25", m: 100 },        // hoy (semana actual)
  { f: "2026-09-19", m: "50.5" },     // hace 6 dias (semana actual, monto como texto)
  { f: "2026-09-18", m: 200 },        // hace 7 dias (semana anterior)
  { f: "2026-09-12", m: 100 },        // hace 13 dias (semana anterior)
  { f: "2026-09-11", m: 999 },        // hace 14 dias: fuera
  { f: "2026-09-30", m: 999 },        // futuro: fuera
  { f: "2026-09-24", m: "abc" },      // monto invalido: se ignora
];
const rs = resumenSemana(ventas, ahora);
assert.deepStrictEqual([rs.actual, rs.registrosActual, rs.anterior, rs.registrosAnterior], [150.5, 2, 300, 2]);
assert.strictEqual(Math.round(rs.variacion), -50, "150.5 vs 300 = -50%");
assert.strictEqual(resumenSemana([{ f: "2026-09-25", m: 10 }], ahora).variacion, null, "sin semana anterior no hay variacion");

// --- telefonos peruanos ---
assert.strictEqual(normalizarTelefonoPE("987 654 321"), "51987654321");
assert.strictEqual(normalizarTelefonoPE(987654321), "51987654321", "numero guardado como numero en el Excel");
assert.strictEqual(normalizarTelefonoPE("+51 987-654-321"), "51987654321");
assert.strictEqual(normalizarTelefonoPE("51987654321"), "51987654321");
for (const mal of ["12345", "01 2345678", "887654321", "", null, undefined, "abc"]) assert.strictEqual(normalizarTelefonoPE(mal), null, String(mal));

// --- mensaje ---
assert.strictEqual(primerNombre("ANA MARIA torres"), "Ana");
const msg = armarMensaje("Hola {nombre}, de {negocio}: {dias} dias. {nombre}!", { nombre: "luis ramirez", negocio: "Taller Andes", dias: 40 });
assert.strictEqual(msg, "Hola Luis, de Taller Andes: 40 dias. Luis!", "reemplaza todas las apariciones");
assert.ok(armarMensaje(PLANTILLA_POR_DEFECTO, { nombre: "Ana", negocio: "X", dias: 30 }).includes("30"));
assert.ok(!/\{|\}/.test(armarMensaje(PLANTILLA_POR_DEFECTO, { nombre: "Ana", negocio: "X", dias: 30 })), "no quedan llaves sin reemplazar");

// --- enlace de WhatsApp: el texto va codificado ---
assert.strictEqual(enlaceWhatsApp("51987654321", "Hola Ana, ¿cómo vas?"), "https://wa.me/51987654321?text=Hola%20Ana%2C%20%C2%BFc%C3%B3mo%20vas%3F");

// --- la plantilla por defecto no usa voseo ---
assert.ok(!/\b(tenés|querés|podés|vos|sabés)\b/i.test(PLANTILLA_POR_DEFECTO));

console.log("OK: test-seguimiento (todas las aserciones pasaron)");
