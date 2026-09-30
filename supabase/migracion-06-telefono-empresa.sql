-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Telefono de contacto del negocio (no el telefono de auth.users, que es para
-- login por SMS): sirve para escribirle por WhatsApp sobre su cuenta y, a
-- futuro, promociones/beneficios. La policy de "ver mi empresa" que ya existe
-- en schema.sql cubre esta columna tambien (es la misma fila de empresas).

alter table empresas add column if not exists telefono text;
