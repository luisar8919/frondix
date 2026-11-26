-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Mensajes que le llegan al numero compartido de WhatsApp de la plataforma --
-- antes el webhook (api/whatsapp/webhook) solo los logueaba y se perdian.
-- `empresa_id` se resuelve comparando el telefono remitente contra el
-- "WhatsApp del negocio" de cada empresa (ver src/lib/whatsappEntrantes.ts);
-- null si no matchea ninguna (se guarda igual, para no perder el dato).
create table if not exists whatsapp_mensajes_entrantes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id) on delete cascade,
  telefono text not null,
  mensaje text,
  recibido_en timestamptz not null default now()
);
create index if not exists whatsapp_mensajes_entrantes_empresa on whatsapp_mensajes_entrantes(empresa_id, recibido_en desc);
alter table whatsapp_mensajes_entrantes enable row level security;
drop policy if exists "ver mis mensajes de whatsapp entrantes" on whatsapp_mensajes_entrantes;
create policy "ver mis mensajes de whatsapp entrantes" on whatsapp_mensajes_entrantes for select
  using (empresa_id in (select public.mis_empresas()));
