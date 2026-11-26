// Chequeo de la lista y el historial de Clientes: node scripts/test-clientes.mjs
// listaClientes()/historialCliente() juntan ventas de VARIOS módulos (incluidos
// los que no tienen rol "cliente" de verdad, ver columnaClienteAmplia) y hacen
// la plata real (totalGastado) -- sin ningún test, un bug acá es un número
// mal mostrado al dueño del negocio sin que nadie se entere.
import assert from "node:assert";
import { listaClientes } from "../src/lib/clientes.ts";
import { historialCliente } from "../src/lib/historialCliente.ts";
import { fakeSupabase } from "./_fakeSupabase.mjs";

const col = (rol, key, extra = {}) => ({ key, label: key, tipo: "texto", rol, ...extra });

const ventasCols = [
  col("cliente", "cliente"),
  col("fecha", "fecha", { tipo: "fecha" }),
  col("monto", "monto", { tipo: "numero" }),
  col("telefono", "telefono"),
];
// Reservas: "cliente" SIN rol (plantillasModulo.ts lo deja null a propósito) --
// columnaClienteAmplia debe encontrarlo igual por la key fija "cliente".
const reservasCols = [
  col(null, "cliente"),
  col("fecha", "fecha", { tipo: "fecha" }),
  col("costo", "monto_cobrado", { tipo: "numero" }),
];

const db = {
  datasets: [
    { id: "ven", empresa_id: "e1", columnas: ventasCols },
    { id: "res", empresa_id: "e1", columnas: reservasCols },
  ],
  records: [
    { dataset_id: "ven", data: { cliente: "ana perez", fecha: "2026-01-10", monto: "100", telefono: "998111111" } },
    { dataset_id: "ven", data: { cliente: "ANA PEREZ", fecha: "2026-02-15", monto: "50" } }, // mismo cliente, sin tel -> no pisa el que ya tenía
    { dataset_id: "res", data: { cliente: "Luis Gomez", fecha: "2026-02-01", monto_cobrado: "80" } },
  ],
  clientes_manual: [
    { empresa_id: "e1", clave: "ana perez", nombre: "ana perez", telefono: "998222222", created_at: "2025-12-01" }, // corrección manual de tel
    { empresa_id: "e1", clave: "carla rios", nombre: "Carla Rios", telefono: "999000000", created_at: "2026-03-01" }, // sin ninguna compra todavía
  ],
};

const supabase = fakeSupabase(db);
const lista = await listaClientes(supabase, "e1");

assert.strictEqual(lista.length, 3, "Ana (ventas), Luis (reservas, via fallback amplio) y Carla (solo manual)");

const ana = lista.find((c) => c.clave === "ana perez");
assert.strictEqual(ana.totalGastado, 150, "100 + 50 de sus 2 compras");
assert.strictEqual(ana.visitas, 2);
assert.strictEqual(ana.telefono, "998222222", "el teléfono manual gana sobre el de la fila de Ventas");
assert.strictEqual(ana.manual, false);

const luis = lista.find((c) => c.clave === "luis gomez");
assert.ok(luis, "Reservas (sin rol \"cliente\" real) igual aparece, via columnaClienteAmplia");
assert.strictEqual(luis.totalGastado, 80, "el \"Monto cobrado\" (rol costo) de Reservas también se suma");

const carla = lista.find((c) => c.clave === "carla rios");
assert.strictEqual(carla.manual, true);
assert.strictEqual(carla.totalGastado, 0, "nunca compró nada, no inventa un monto");
assert.strictEqual(carla.telefono, "999000000");

// --- historialCliente: mismo criterio, detalle fila por fila ---
const historial = await historialCliente(supabase, "e1", "Ana Perez");
assert.strictEqual(historial.cantidadCompras, 2);
assert.strictEqual(historial.totalGastado, 150);
assert.strictEqual(historial.movimientos[0].fecha, "2026-02-15", "más reciente primero");

const historialSinCompras = await historialCliente(supabase, "e1", "Carla Rios");
assert.strictEqual(historialSinCompras.cantidadCompras, 0);
assert.strictEqual(historialSinCompras.totalGastado, 0);

console.log("OK: test-clientes (todas las aserciones pasaron)");
