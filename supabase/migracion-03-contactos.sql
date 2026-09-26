-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Guarda a quien ya se le escribio por WhatsApp desde la pantalla de Seguimiento,
-- para no volver a proponerle el mismo cliente al dueño durante unos dias.

create table if not exists contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  cliente text not null,
  canal text not null default 'whatsapp',
  mensaje text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists contactos_busqueda_idx on contactos (empresa_id, dataset_id, created_at desc);

alter table contactos enable row level security;

drop policy if exists "ver contactos de mi empresa" on contactos;
create policy "ver contactos de mi empresa" on contactos for select
  using (empresa_id in (select public.mis_empresas()));

drop policy if exists "registrar contactos en mi empresa" on contactos;
create policy "registrar contactos en mi empresa" on contactos for insert
  with check (empresa_id in (select public.mis_empresas()) and created_by = auth.uid());
