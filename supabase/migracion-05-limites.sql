-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Registro de llamadas a "Sugerir con IA", para limitar cuantas puede hacer una
-- empresa por hora (cada llamada cuesta dinero real en la API de Claude).
-- Solo se lee/escribe desde el servidor con la llave de servicio: sin policies,
-- RLS activado por defecto lo deja cerrado a cualquier otro rol.

create table if not exists ia_llamadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ia_llamadas_empresa_fecha_idx on ia_llamadas (empresa_id, created_at desc);

alter table ia_llamadas enable row level security;
