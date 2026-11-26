-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Un registro por cada WhatsApp (Cloud API, plantilla aprobada) que de verdad
-- se mando -- cada uno tiene costo real segun la tarifa de Meta, asi que esto
-- es lo que alimenta el contador de "Notificaciones" (ver /dashboard/notificaciones).
-- Solo se inserta desde el cron (cliente admin); de lectura, cada empresa ve
-- solo lo suyo.
create table if not exists whatsapp_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  enviado_en timestamptz not null default now()
);
create index if not exists whatsapp_envios_empresa_fecha on whatsapp_envios(empresa_id, enviado_en);
alter table whatsapp_envios enable row level security;
drop policy if exists "ver mis envios de whatsapp" on whatsapp_envios;
create policy "ver mis envios de whatsapp" on whatsapp_envios for select
  using (empresa_id in (select public.mis_empresas()));
