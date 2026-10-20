-- Correr esto una vez en Supabase > SQL Editor
alter table empresas add column if not exists catalogo_publico boolean not null default false;
