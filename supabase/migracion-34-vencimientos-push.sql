-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Aviso push cuando un producto de Stock esta por vencer (columna con rol
-- "fecha_vencimiento"). Ver /api/cron/vencimientos-push.

-- Evita mandar el mismo aviso en cada corrida del cron: una fila por registro
-- de Stock ya avisado. Si el dueno cambia la fecha de vencimiento (repuso con
-- un lote nuevo), fecha_avisada ya no coincide y se vuelve a poder avisar.
create table if not exists vencimientos_avisados (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null unique references records(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  fecha_avisada text not null,
  avisado_en timestamptz not null default now()
);
alter table vencimientos_avisados enable row level security;

-- Solo lo usa el cron (cliente admin, salta RLS); esta policy es por si algun
-- dia se lee desde el cliente normal, igual que el resto de tablas del schema.
drop policy if exists "ver vencimientos avisados de mi empresa" on vencimientos_avisados;
create policy "ver vencimientos avisados de mi empresa" on vencimientos_avisados for select
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));
