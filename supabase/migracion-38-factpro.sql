-- Correr esto una vez en Supabase > SQL Editor
-- Facturacion electronica (FactPro/SUNAT), una empresa FactPro por cada
-- empresa de Frondix. factpro_token es el token DE EMPRESA que devuelve
-- crearEmpresa() (src/lib/factpro.ts) -- nunca el token de usuario de Frondix
-- (ese vive en env, FACTPRO_USER_TOKEN, no se guarda por empresa).
alter table empresas add column if not exists ruc text;
alter table empresas add column if not exists factpro_token text;
alter table empresas add column if not exists factpro_entorno text not null default 'demo' check (factpro_entorno in ('demo', 'produccion'));
-- Series reales ya creadas en FactPro (crearSerie) para emitir factura/boleta.
-- Null hasta que se completa el onboarding de facturacion electronica.
alter table empresas add column if not exists factpro_serie_factura text;
alter table empresas add column if not exists factpro_serie_boleta text;
