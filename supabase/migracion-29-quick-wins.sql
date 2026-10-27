-- Quick wins de velocidad/WhatsApp (2026-10-23): teléfono del cliente en la
-- cotización (para armar el link de wa.me) y un token público para que el
-- cliente pueda aceptarla/rechazarla sin loguearse (ver /cotizar/[id] y
-- /api/cotizaciones/publica/[id] -- esa ruta usa el cliente admin, por eso
-- no hace falta una policy nueva de RLS).
alter table cotizaciones add column if not exists telefono text;
alter table cotizaciones add column if not exists token uuid not null default gen_random_uuid();
