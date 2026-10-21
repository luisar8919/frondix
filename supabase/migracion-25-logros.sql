-- Hitos del negocio ("primer módulo creado", "primera venta registrada"...):
-- se guardan una sola vez por empresa, con la fecha real en que se detectaron.
-- El catálogo completo (claves, títulos, qué hace falta para cada uno, cuáles
-- son del plan pago) vive en src/lib/logros.ts -- esta tabla solo guarda
-- CUÁLES ya se lograron y CUÁNDO.
create table logros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  clave text not null,
  logrado_en timestamptz not null default now(),
  unique (empresa_id, clave)
);
alter table logros enable row level security;
create policy "ver logros de mi empresa" on logros for select
  using (empresa_id in (select public.mis_empresas()));
create policy "insertar logros de mi empresa" on logros for insert
  with check (empresa_id in (select public.mis_empresas()));

grant select on public.logros to anon;
grant select, insert, update, delete on public.logros to authenticated;
grant select, insert, update, delete on public.logros to service_role;
