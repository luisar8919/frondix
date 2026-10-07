-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Sustento contable por registro (referencia a boleta/factura, etc.) -- un campo
-- del PLATAFORMA, no una columna del Excel, por eso va directo en "records" y no
-- dentro de "data" (que son solo las columnas que el usuario subio).

alter table records add column if not exists sustento text;
