-- Ficha de cliente editable (espejo de proveedores_manual, migración 26): antes
-- un cliente con compras no tenía ningún registro propio donde guardar/editar
-- su teléfono -- esta tabla es ese directorio manual, igual que
-- proveedores_manual. También permite agregar un cliente a mano antes de su
-- primera compra.
create table clientes_manual (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  clave text not null,
  nombre text not null,
  telefono text,
  created_at timestamptz not null default now(),
  unique (empresa_id, clave)
);
alter table clientes_manual enable row level security;
create policy "ver clientes manuales de mi empresa" on clientes_manual for select
  using (empresa_id in (select public.mis_empresas()));
create policy "crear clientes manuales en mi empresa" on clientes_manual for insert
  with check (empresa_id in (select public.mis_empresas()));
create policy "borrar clientes manuales de mi empresa" on clientes_manual for delete
  using (empresa_id in (select public.mis_empresas()));

grant select on public.clientes_manual to anon;
grant select, insert, update, delete on public.clientes_manual to authenticated;
grant select, insert, update, delete on public.clientes_manual to service_role;
