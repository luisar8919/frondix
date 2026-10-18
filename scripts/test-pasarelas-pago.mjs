// Chequeo de la verificacion de firma de Paddle: node --env-file=.env.local scripts/test-pasarelas-pago.mjs
import assert from "node:assert";
import { createHmac } from "node:crypto";

process.env.PADDLE_WEBHOOK_SECRET = "secreto-de-prueba";
const { verificarFirmaPaddle } = await import("../src/lib/paddle.ts");

const cuerpo = JSON.stringify({ event_type: "subscription.activated" });
const ts = "1700000000";
const h1 = createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET).update(`${ts}:${cuerpo}`).digest("hex");

assert.strictEqual(verificarFirmaPaddle(`ts=${ts};h1=${h1}`, cuerpo), true, "firma valida deberia pasar");
assert.strictEqual(verificarFirmaPaddle(`ts=${ts};h1=${h1}00`, cuerpo), false, "firma con hmac alterado no deberia pasar");
assert.strictEqual(verificarFirmaPaddle(`ts=${ts};h1=${h1}`, cuerpo + "x"), false, "cuerpo alterado no deberia pasar");
assert.strictEqual(verificarFirmaPaddle(null, cuerpo), false, "sin header no deberia pasar");
assert.strictEqual(verificarFirmaPaddle("formato-raro", cuerpo), false, "header sin ts/h1 no deberia pasar");

console.log("OK: test-pasarelas-pago (todas las aserciones pasaron)");
