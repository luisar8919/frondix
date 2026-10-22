-- Ficha de proveedor (espejo de clientes): un proveedor normalmente nace de
-- una columna Proveedor en un módulo de Compras, pero "Proveedor > Registrar"
-- en la barra permite agregar uno a mano ANTES de la primera compra -- estas
-- filas son ese directorio manual, igual que etapas_cliente.manual para
-- prospectos que todavía no compraron.
create table proveedores_manual (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  clave text not null,
  nombre text not null,
  telefono text,
  created_at timestamptz not null default now(),
  unique (empresa_id, clave)
);
alter table proveedores_manual enable row level security;
create policy "ver proveedores manuales de mi empresa" on proveedores_manual for select
  using (empresa_id in (select public.mis_empresas()));
create policy "crear proveedores manuales en mi empresa" on proveedores_manual for insert
  with check (empresa_id in (select public.mis_empresas()));
create policy "borrar proveedores manuales de mi empresa" on proveedores_manual for delete
  using (empresa_id in (select public.mis_empresas()));

grant select on public.proveedores_manual to anon;
grant select, insert, update, delete on public.proveedores_manual to authenticated;
grant select, insert, update, delete on public.proveedores_manual to service_role;
