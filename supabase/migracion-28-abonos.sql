-- Abonos (pagos parciales) sobre una cuenta por cobrar: hasta ahora el
-- "Saldo pendiente" de una venta a crédito era un número que el dueño editaba
-- a mano cuando le pagaban, sin quedar registro de cuándo ni cuánto. Cada fila
-- acá es un pago real que resta del saldo (ver /api/cuentas-por-cobrar/abonos),
-- dataset_id/record_id apuntan a la fila de Ventas que tiene esa deuda.
create table abonos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  monto numeric not null check (monto > 0),
  fecha date not null default current_date,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index abonos_record_idx on abonos (record_id, created_at desc);
alter table abonos enable row level security;
create policy "ver abonos de mi empresa" on abonos for select
  using (empresa_id in (select public.mis_empresas()));
create policy "crear abonos en mi empresa" on abonos for insert
  with check (empresa_id in (select public.mis_empresas()));
create policy "borrar abonos de mi empresa" on abonos for delete
  using (empresa_id in (select public.mis_empresas()));

grant select on public.abonos to anon;
grant select, insert, update, delete on public.abonos to authenticated;
grant select, insert, update, delete on public.abonos to service_role;
