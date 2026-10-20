-- Correr esto una vez en Supabase > SQL Editor. No borra ningun dato.
-- Ficha de cliente (notas) y Ordenes de compra. Ver src/lib/clientes.ts y
-- src/app/api/ordenes-compra.

create table if not exists notas_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_clave text not null,
  texto text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists notas_cliente_clave_idx on notas_cliente (empresa_id, cliente_clave);
alter table notas_cliente enable row level security;
drop policy if exists "ver notas de cliente de mi empresa" on notas_cliente;
create policy "ver notas de cliente de mi empresa" on notas_cliente for select
  using (empresa_id in (select public.mis_empresas()));
drop policy if exists "crear notas de cliente en mi empresa" on notas_cliente;
create policy "crear notas de cliente en mi empresa" on notas_cliente for insert
  with check (empresa_id in (select public.mis_empresas()));
drop policy if exists "borrar notas de cliente de mi empresa" on notas_cliente;
create policy "borrar notas de cliente de mi empresa" on notas_cliente for delete
  using (empresa_id in (select public.mis_empresas()));

create table if not exists ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  proveedor text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'recibida', 'cancelada')),
  fecha_pedido date not null default current_date,
  fecha_recepcion date,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table ordenes_compra enable row level security;
drop policy if exists "ver ordenes de compra de mi empresa" on ordenes_compra;
create policy "ver ordenes de compra de mi empresa" on ordenes_compra for select
  using (empresa_id in (select public.mis_empresas()));
drop policy if exists "crear ordenes de compra en mi empresa" on ordenes_compra;
create policy "crear ordenes de compra en mi empresa" on ordenes_compra for insert
  with check (empresa_id in (select public.mis_empresas()));
drop policy if exists "editar ordenes de compra de mi empresa" on ordenes_compra;
create policy "editar ordenes de compra de mi empresa" on ordenes_compra for update
  using (empresa_id in (select public.mis_empresas()));
drop policy if exists "borrar ordenes de compra de mi empresa" on ordenes_compra;
create policy "borrar ordenes de compra de mi empresa" on ordenes_compra for delete
  using (empresa_id in (select public.mis_empresas()));

create table if not exists orden_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes_compra(id) on delete cascade,
  producto text not null,
  cantidad numeric not null,
  costo_unitario numeric
);
alter table orden_compra_items enable row level security;
drop policy if exists "ver items de ordenes de mi empresa" on orden_compra_items;
create policy "ver items de ordenes de mi empresa" on orden_compra_items for select
  using (orden_id in (select id from ordenes_compra where empresa_id in (select public.mis_empresas())));
drop policy if exists "crear items de ordenes en mi empresa" on orden_compra_items;
create policy "crear items de ordenes en mi empresa" on orden_compra_items for insert
  with check (orden_id in (select id from ordenes_compra where empresa_id in (select public.mis_empresas())));
drop policy if exists "borrar items de ordenes de mi empresa" on orden_compra_items;
create policy "borrar items de ordenes de mi empresa" on orden_compra_items for delete
  using (orden_id in (select id from ordenes_compra where empresa_id in (select public.mis_empresas())));
