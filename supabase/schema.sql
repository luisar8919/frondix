-- Correr esto una vez en Supabase > SQL Editor

create extension if not exists "pgcrypto";

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

create table miembros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'miembro' check (rol in ('dueno', 'admin', 'miembro')),
  created_at timestamptz not null default now(),
  unique (empresa_id, user_id)
);

create table datasets (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  columnas jsonb not null, -- [{ "key": "nombre", "label": "Nombre", "tipo": "texto" }, ...]
  archivo_original_url text,
  created_at timestamptz not null default now()
);

create table records (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index records_dataset_creado_idx on records (dataset_id, created_at desc);
create index datasets_empresa_idx on datasets (empresa_id);

create table suscripciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade unique,
  culqi_customer_id text,
  culqi_subscription_id text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'vencida', 'cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A quien ya se le escribio por WhatsApp desde Seguimiento (para no insistir).
create table contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  cliente text not null,
  canal text not null default 'whatsapp',
  mensaje text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index contactos_busqueda_idx on contactos (empresa_id, dataset_id, created_at desc);

-- Row Level Security: un usuario solo ve/edita datos de las empresas donde es miembro.
alter table contactos enable row level security;
alter table empresas enable row level security;
alter table miembros enable row level security;
alter table datasets enable row level security;
alter table records enable row level security;
alter table suscripciones enable row level security;

-- Las reglas de "miembros" no pueden consultar "miembros" directamente (recursion
-- infinita). Estas funciones leen la tabla saltandose RLS y devuelven solo las
-- empresas del usuario logueado.
create or replace function public.mis_empresas() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select empresa_id from public.miembros where user_id = auth.uid()
$$;

create or replace function public.mis_empresas_admin() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select empresa_id from public.miembros where user_id = auth.uid() and rol in ('dueno', 'admin')
$$;

revoke all on function public.mis_empresas() from public, anon;
revoke all on function public.mis_empresas_admin() from public, anon;
grant execute on function public.mis_empresas() to authenticated;
grant execute on function public.mis_empresas_admin() to authenticated;

create policy "ver mi empresa" on empresas for select
  using (id in (select public.mis_empresas()));

create policy "ver miembros de mi empresa" on miembros for select
  using (empresa_id in (select public.mis_empresas()));

create policy "dueno/admin gestiona miembros" on miembros for all
  using (empresa_id in (select public.mis_empresas_admin()));

create policy "ver datasets de mi empresa" on datasets for select
  using (empresa_id in (select public.mis_empresas()));

create policy "crear datasets en mi empresa" on datasets for insert
  with check (empresa_id in (select public.mis_empresas()));

create policy "dueno/admin edita datasets" on datasets for update
  using (empresa_id in (select public.mis_empresas_admin()))
  with check (empresa_id in (select public.mis_empresas_admin()));

create policy "dueno/admin borra datasets" on datasets for delete
  using (empresa_id in (select public.mis_empresas_admin()));

create policy "ver records de mi empresa" on records for select
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "crear records en mi empresa" on records for insert
  with check (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "editar records de mi empresa" on records for update
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "ver suscripcion de mi empresa" on suscripciones for select
  using (empresa_id in (select public.mis_empresas()));

create policy "ver contactos de mi empresa" on contactos for select
  using (empresa_id in (select public.mis_empresas()));

create policy "registrar contactos en mi empresa" on contactos for insert
  with check (empresa_id in (select public.mis_empresas()) and created_by = auth.uid());
