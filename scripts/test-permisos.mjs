// node scripts/test-permisos.mjs
import assert from "node:assert";
import { esVendedor, esMozo, rolRestringido } from "../src/lib/permisos.ts";

assert.strictEqual(esVendedor("vendedor"), true);
assert.strictEqual(esVendedor("mozo"), false);
assert.strictEqual(esMozo("mozo"), true);
assert.strictEqual(esMozo("vendedor"), false);

// rolRestringido: la bandera compartida que usan los ~25 endpoints que
// bloquean costos/compras/reportes -- vendedor Y mozo deben caer acá.
assert.strictEqual(rolRestringido("vendedor"), true);
assert.strictEqual(rolRestringido("mozo"), true);
assert.strictEqual(rolRestringido("dueno"), false);
assert.strictEqual(rolRestringido("admin"), false);
assert.strictEqual(rolRestringido("miembro"), false);
assert.strictEqual(rolRestringido(undefined), false);
assert.strictEqual(rolRestringido(null), false);

console.log("OK: test-permisos (todas las aserciones pasaron)");
