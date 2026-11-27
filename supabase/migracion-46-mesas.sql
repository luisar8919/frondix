-- Correr esto una vez en Supabase > SQL Editor
-- Mesas persistentes del Punto de Venta (antes solo vivían en memoria del
-- navegador, se perdían al recargar y no se compartían entre dispositivos).
-- mozo_user_id/mozo_email: quien abrió la mesa (ver "apertura de mesa, mozo
-- asignado") -- cualquier miembro de la empresa puede igual operar cualquier
-- mesa (no es un candado de acceso, solo deja registro de quién la atiende).
create table mesas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  nombre text not null,
  ambiente text not null default 'General',
  cliente text,
  mozo_user_id uuid references auth.users(id),
  mozo_email text,
  carrito jsonb not null default '[]',
  creada_en timestamptz not null default now()
);

alter table mesas enable row level security;

create policy "ver mesas de mi empresa" on mesas for select
  using (empresa_id in (select public.mis_empresas()));

create policy "gestionar mesas de mi empresa" on mesas for all
  using (empresa_id in (select public.mis_empresas()))
  with check (empresa_id in (select public.mis_empresas()));

create index mesas_dataset_id_idx on mesas(dataset_id);

-- Tabla nueva creada después del 30/10/2026: Supabase ya no le da acceso a la
-- Data API por defecto (ver el mismo bloque al final de schema.sql) -- sin
-- esto, PostgREST responde "permission denied" aunque la RLS de arriba esté
-- bien.
grant select on public.mesas to anon;
grant select, insert, update, delete on public.mesas to authenticated;
grant select, insert, update, delete on public.mesas to service_role;
