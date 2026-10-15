-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Kardex real: a diferencia de Stock (que solo guarda la cantidad ACTUAL de
-- cada producto, se pisa en cada venta/compra/edicion sin dejar rastro), esta
-- tabla guarda cada movimiento -- venta, compra o ajuste manual -- con el
-- saldo resultante despues de ese movimiento. Ver src/lib/stock.ts.

create table if not exists movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade, -- el dataset de Stock
  producto text not null,
  tipo text not null check (tipo in ('venta', 'compra', 'ajuste')),
  cantidad numeric not null, -- delta con signo (+entrada, -salida)
  saldo numeric not null, -- cantidad resultante despues de este movimiento
  motivo text, -- solo para 'ajuste': por que se corrigio a mano
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists movimientos_stock_producto_idx on movimientos_stock (dataset_id, producto, created_at desc);

alter table movimientos_stock enable row level security;

drop policy if exists "ver movimientos de stock de mi empresa" on movimientos_stock;
create policy "ver movimientos de stock de mi empresa" on movimientos_stock for select
  using (empresa_id in (select public.mis_empresas()));

drop policy if exists "crear movimientos de stock en mi empresa" on movimientos_stock;
create policy "crear movimientos de stock en mi empresa" on movimientos_stock for insert
  with check (empresa_id in (select public.mis_empresas()) and created_by = auth.uid());
