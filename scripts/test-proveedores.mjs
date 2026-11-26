// Chequeo de la lista y el historial de Proveedores: node scripts/test-proveedores.mjs
// Espejo de test-clientes.mjs (ver ese archivo), pero confirma además la
// asimetría real a propósito: Proveedores NO tiene el fallback "columna sin
// rol" que sí tiene Clientes (Reservas/Órdenes de servicio) -- no hay ningún
// rubro de compras sin rol "proveedor" real, así que un dataset sin ese rol
// debe quedar afuera en vez de colarse.
import assert from "node:assert";
import { listaProveedores, historialProveedor } from "../src/lib/proveedores.ts";
import { fakeSupabase } from "./_fakeSupabase.mjs";

const col = (rol, key, extra = {}) => ({ key, label: key, tipo: "texto", rol, ...extra });

const comprasCols = [
  col("proveedor", "proveedor"),
  col("fecha", "fecha", { tipo: "fecha" }),
  col("monto", "monto", { tipo: "numero" }),
  col("telefono", "telefono"),
];
// Un dataset con una columna "proveedor" de TEXTO LIBRE (sin el rol marcado) --
// a diferencia de Clientes, acá no hay fallback: no debe aportar nada.
const sinRolCols = [col(null, "proveedor"), col("fecha", "fecha", { tipo: "fecha" })];

const db = {
  datasets: [
    { id: "com", empresa_id: "e1", columnas: comprasCols },
    { id: "otro", empresa_id: "e1", columnas: sinRolCols },
  ],
  records: [
    { dataset_id: "com", data: { proveedor: "distribuidora sur", fecha: "2026-01-10", monto: "500", telefono: "987111111" } },
    { dataset_id: "com", data: { proveedor: "DISTRIBUIDORA SUR", fecha: "2026-02-15", monto: "300" } },
    { dataset_id: "otro", data: { proveedor: "Fantasma SAC", fecha: "2026-02-01" } }, // nunca debe aparecer
  ],
  proveedores_manual: [
    { empresa_id: "e1", clave: "distribuidora sur", nombre: "distribuidora sur", telefono: "987222222", created_at: "2025-12-01" },
    { empresa_id: "e1", clave: "ferreteria lima", nombre: "Ferreteria Lima", telefono: "988000000", created_at: "2026-03-01" },
  ],
};

const supabase = fakeSupabase(db);
const lista = await listaProveedores(supabase, "e1");

assert.strictEqual(lista.length, 2, "Distribuidora Sur (compras) y Ferreteria Lima (solo manual) -- 'Fantasma SAC' no cuenta, sin rol proveedor real");
assert.ok(!lista.some((p) => p.clave === "fantasma sac"), "un dataset sin rol \"proveedor\" real no aporta proveedores (a diferencia de Clientes)");

const distribuidora = lista.find((p) => p.clave === "distribuidora sur");
assert.strictEqual(distribuidora.totalComprado, 800, "500 + 300");
assert.strictEqual(distribuidora.visitas, 2);
assert.strictEqual(distribuidora.telefono, "987222222", "el teléfono manual gana sobre el de la fila de Compras");

const ferreteria = lista.find((p) => p.clave === "ferreteria lima");
assert.strictEqual(ferreteria.manual, true);
assert.strictEqual(ferreteria.totalComprado, 0);

// --- historialProveedor ---
const historial = await historialProveedor(supabase, "e1", "Distribuidora Sur");
assert.strictEqual(historial.cantidadCompras, 2);
assert.strictEqual(historial.totalComprado, 800);
assert.strictEqual(historial.movimientos[0].fecha, "2026-02-15", "más reciente primero");

console.log("OK: test-proveedores (todas las aserciones pasaron)");
