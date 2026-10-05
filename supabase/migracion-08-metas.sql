-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Metas de venta por producto: "quiero vender 50 de Mario Kart este mes", y
-- Reportes calcula cuantos van vendidos y cuantos faltan.

create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  producto text not null,
  cantidad_objetivo integer not null check (cantidad_objetivo > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_id, producto)
);
create index if not exists metas_dataset_idx on metas (dataset_id);

alter table metas enable row level security;

drop policy if exists "ver metas de mi empresa" on metas;
create policy "ver metas de mi empresa" on metas for select
  using (empresa_id in (select public.mis_empresas()));

drop policy if exists "crear metas en mi empresa" on metas;
create policy "crear metas en mi empresa" on metas for insert
  with check (empresa_id in (select public.mis_empresas()) and created_by = auth.uid());

drop policy if exists "editar metas de mi empresa" on metas;
create policy "editar metas de mi empresa" on metas for update
  using (empresa_id in (select public.mis_empresas()));

drop policy if exists "borrar metas de mi empresa" on metas;
create policy "borrar metas de mi empresa" on metas for delete
  using (empresa_id in (select public.mis_empresas()));
