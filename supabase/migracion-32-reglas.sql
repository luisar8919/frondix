-- Correr esto una vez en Supabase > SQL Editor
-- "Reglas" por modulo: condicion -> accion (ver src/lib/reglas.ts). Incluye el
-- ajuste automatico de Stock traducido al mismo sistema (antes vivia solo como
-- un efecto invisible del enlace Producto->Stock, ver src/lib/stock.ts).
alter table datasets add column if not exists reglas jsonb not null default '[]'::jsonb;
