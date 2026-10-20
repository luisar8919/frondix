-- Correr esto una vez en Supabase > SQL Editor
create table if not exists etapas_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_clave text not null,
  cliente_nombre text not null,
  telefono text,
  etapa text not null default 'prospecto' check (etapa in ('prospecto', 'contactado', 'negociacion', 'cliente', 'perdido')),
  -- true si este registro lo creo el dueno a mano (prospecto que todavia no compro
  -- nada) -- false si es un cliente que ya aparece en Ventas y solo se le cambio
  -- la etapa manualmente.
  manual boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (empresa_id, cliente_clave)
);
alter table etapas_cliente enable row level security;
drop policy if exists "ver etapas de mi empresa" on etapas_cliente;
create policy "ver etapas de mi empresa" on etapas_cliente for select
  using (empresa_id in (select public.mis_empresas()));
drop policy if exists "crear etapas en mi empresa" on etapas_cliente;
create policy "crear etapas en mi empresa" on etapas_cliente for insert
  with check (empresa_id in (select public.mis_empresas()));
drop policy if exists "editar etapas de mi empresa" on etapas_cliente;
create policy "editar etapas de mi empresa" on etapas_cliente for update
  using (empresa_id in (select public.mis_empresas()));
drop policy if exists "borrar etapas de mi empresa" on etapas_cliente;
create policy "borrar etapas de mi empresa" on etapas_cliente for delete
  using (empresa_id in (select public.mis_empresas()));
