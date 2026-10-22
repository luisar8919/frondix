-- Cotizaciones: un paso antes de la venta confirmada (cliente le pidió
-- precio, todavía no dijo que sí). Al aceptarse, crea un registro real en el
-- módulo de Ventas -- ver /api/cotizaciones/[id] (acción "aceptar"). Tabla
-- propia, no un dataset genérico más: tiene un ciclo de vida (estado) con una
-- acción con efecto real (crear la venta), igual que ordenes_compra.
create table cotizaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente text not null,
  producto text not null,
  monto numeric not null,
  fecha date not null default current_date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  venta_dataset_id uuid references datasets(id) on delete set null,
  venta_record_id uuid references records(id) on delete set null,
  notas text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table cotizaciones enable row level security;
create policy "ver cotizaciones de mi empresa" on cotizaciones for select
  using (empresa_id in (select public.mis_empresas()));
create policy "crear cotizaciones en mi empresa" on cotizaciones for insert
  with check (empresa_id in (select public.mis_empresas()));
create policy "editar cotizaciones de mi empresa" on cotizaciones for update
  using (empresa_id in (select public.mis_empresas()));
create policy "borrar cotizaciones de mi empresa" on cotizaciones for delete
  using (empresa_id in (select public.mis_empresas()));

grant select on public.cotizaciones to anon;
grant select, insert, update, delete on public.cotizaciones to authenticated;
grant select, insert, update, delete on public.cotizaciones to service_role;
