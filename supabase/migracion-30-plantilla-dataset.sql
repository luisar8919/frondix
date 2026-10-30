-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Marca con que plantilla curada (src/lib/plantillasModulo.ts) se creo un
-- modulo, SOLO cuando viene del selector /dashboard/modulos/nuevo (o el paso
-- de rubro del onboarding). Null para Ventas/Compras basicos, para cualquier
-- modulo subido por Excel, y para "Empezar sin Excel" (sugerencia por IA) --
-- esos siguen gratis para siempre. Se usa para bloquear los modulos
-- adicionales hasta que la empresa active su prueba gratis o pague de verdad
-- (ver tieneSuscripcionActiva en src/lib/suscripcion.ts).

alter table datasets add column if not exists plantilla text;
