-- Correr esto una vez en Supabase > SQL Editor

create extension if not exists "pgcrypto";

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text, -- WhatsApp del negocio: contacto de cuenta y, a futuro, promociones
  -- Catalogo publico de productos (migracion 23): opt-in, apagado por
  -- defecto -- sin esto, nadie de afuera deberia poder ver precios/stock.
  catalogo_publico boolean not null default false,
  created_at timestamptz not null default now()
);

create table miembros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol text not null default 'miembro' check (rol in ('dueno', 'admin', 'miembro', 'vendedor')), -- vendedor: migracion 17
  created_at timestamptz not null default now(),
  unique (empresa_id, user_id)
);

create table datasets (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  columnas jsonb not null, -- [{ "key": "nombre", "label": "Nombre", "tipo": "texto" }, ...]
  archivo_original_url text,
  incluye_igv boolean not null default false, -- las ventas de este modulo ya traen el 18% incluido
  -- En que moneda estan los montos de este modulo (migracion 21) -- cada modulo
  -- es independiente, no hay conversion automatica entre monedas distintas.
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD')),
  created_at timestamptz not null default now()
);

create table records (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets(id) on delete cascade,
  data jsonb not null,
  -- Sustento contable (boleta/factura, etc.): campo de la plataforma, no una
  -- columna del Excel, por eso va aparte de "data".
  sustento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Email de quien creó o editó por última vez este registro (historial mínimo:
  -- "quién cambió esto"). Null en registros creados antes de esta columna.
  updated_by text
);
create index records_dataset_creado_idx on records (dataset_id, created_at desc);
create index datasets_empresa_idx on datasets (empresa_id);

create table suscripciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade unique,
  culqi_customer_id text,
  culqi_subscription_id text,
  paypal_subscription_id text,
  paddle_subscription_id text,
  -- Cual de las 3 se uso para pagar -- principalmente para saber a que API llamar
  -- al cancelar; con los *_subscription_id ya alcanzaba, pero esto es mas directo.
  pasarela text check (pasarela in ('culqi', 'paypal', 'paddle')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'activa', 'vencida', 'cancelada')),
  -- Prueba gratis de 3 meses al crear la empresa: mientras no pase esta fecha,
  -- estado='activa' cuenta como plan pago aunque no haya pagado. Se limpia (null)
  -- al pagar de verdad, para que quede activa sin depender de una fecha.
  prueba_hasta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A quien ya se le escribio por WhatsApp desde Seguimiento (para no insistir).
create table contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  cliente text not null,
  canal text not null default 'whatsapp',
  mensaje text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index contactos_busqueda_idx on contactos (empresa_id, dataset_id, created_at desc);

-- Metas de venta por producto: "quiero vender 50 de Mario Kart este mes", y
-- Reportes calcula cuantos van vendidos y cuantos faltan.
create table metas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  producto text not null,
  cantidad_objetivo integer not null check (cantidad_objetivo > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_id, producto)
);
create index metas_dataset_idx on metas (dataset_id);

-- Row Level Security: un usuario solo ve/edita datos de las empresas donde es miembro.
alter table contactos enable row level security;
alter table metas enable row level security;
alter table empresas enable row level security;
alter table miembros enable row level security;
alter table datasets enable row level security;
alter table records enable row level security;
alter table suscripciones enable row level security;

-- Las reglas de "miembros" no pueden consultar "miembros" directamente (recursion
-- infinita). Estas funciones leen la tabla saltandose RLS y devuelven solo las
-- empresas del usuario logueado.
create or replace function public.mis_empresas() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select empresa_id from public.miembros where user_id = auth.uid()
$$;

create or replace function public.mis_empresas_admin() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select empresa_id from public.miembros where user_id = auth.uid() and rol in ('dueno', 'admin')
$$;

revoke all on function public.mis_empresas() from public, anon;
revoke all on function public.mis_empresas_admin() from public, anon;
grant execute on function public.mis_empresas() to authenticated;
grant execute on function public.mis_empresas_admin() to authenticated;

create policy "ver mi empresa" on empresas for select
  using (id in (select public.mis_empresas()));

create policy "ver miembros de mi empresa" on miembros for select
  using (empresa_id in (select public.mis_empresas()));

create policy "dueno/admin gestiona miembros" on miembros for all
  using (empresa_id in (select public.mis_empresas_admin()));

create policy "ver datasets de mi empresa" on datasets for select
  using (empresa_id in (select public.mis_empresas()));

create policy "crear datasets en mi empresa" on datasets for insert
  with check (empresa_id in (select public.mis_empresas()));

create policy "dueno/admin edita datasets" on datasets for update
  using (empresa_id in (select public.mis_empresas_admin()))
  with check (empresa_id in (select public.mis_empresas_admin()));

create policy "dueno/admin borra datasets" on datasets for delete
  using (empresa_id in (select public.mis_empresas_admin()));

create policy "ver records de mi empresa" on records for select
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "crear records en mi empresa" on records for insert
  with check (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "editar records de mi empresa" on records for update
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "ver suscripcion de mi empresa" on suscripciones for select
  using (empresa_id in (select public.mis_empresas()));

create policy "ver contactos de mi empresa" on contactos for select
  using (empresa_id in (select public.mis_empresas()));

create policy "registrar contactos en mi empresa" on contactos for insert
  with check (empresa_id in (select public.mis_empresas()) and created_by = auth.uid());

create policy "ver metas de mi empresa" on metas for select
  using (empresa_id in (select public.mis_empresas()));

create policy "crear metas en mi empresa" on metas for insert
  with check (empresa_id in (select public.mis_empresas()) and created_by = auth.uid());

create policy "editar metas de mi empresa" on metas for update
  using (empresa_id in (select public.mis_empresas()));

create policy "borrar metas de mi empresa" on metas for delete
  using (empresa_id in (select public.mis_empresas()));

-- Editar tablas (migracion 04): borrar registros y quitar columnas.
drop policy if exists "borrar records de mi empresa" on records;
create policy "borrar records de mi empresa" on records for delete
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

-- Saca la clave de todos los registros de la tabla. Corre con los permisos de quien llama
-- (security invoker), asi que las reglas de acceso siguen aplicando.
create or replace function public.quitar_columna(p_dataset uuid, p_key text) returns void
  language sql security invoker set search_path = public as $$
  update public.records set data = data - p_key, updated_at = now() where dataset_id = p_dataset
$$;

revoke all on function public.quitar_columna(uuid, text) from public, anon;
grant execute on function public.quitar_columna(uuid, text) to authenticated;

-- Limites de uso (migracion 05): registro de llamadas a "Sugerir con IA" para limitar
-- cuantas puede hacer una empresa por hora. Sin policies: solo el servidor (llave de
-- servicio) lo lee/escribe; RLS activado por defecto lo cierra a cualquier otro rol.
create table if not exists ia_llamadas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  -- Nombre del archivo, solo para "Sugerir con IA" (limite de 3/dia POR
  -- documento); null para highlights, que limita por empresa, no por archivo.
  documento text,
  created_at timestamptz not null default now()
);
create index if not exists ia_llamadas_empresa_fecha_idx on ia_llamadas (empresa_id, created_at desc);
alter table ia_llamadas enable row level security;

-- Highlights con IA guardados por empresa (migracion 09): se generan solos, como mucho
-- una vez al dia y solo si los numeros cambiaron -- ver /api/highlights.
create table highlights (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  contenido jsonb not null,
  huella text not null,
  generado_en timestamptz not null default now()
);
alter table highlights enable row level security;
create policy "ver highlights de mi empresa" on highlights for select
  using (empresa_id in (select public.mis_empresas()));

-- Registro de que fuente dio la recomendacion de cada highlights generado -- patron
-- determinista (y cual) o Gemini (migracion 15). Ver src/lib/patronesRecomendacion.ts.
create table recomendacion_usos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  fuente text not null check (fuente in ('patron', 'gemini')),
  patron_id text,
  created_at timestamptz not null default now()
);
create index recomendacion_usos_fuente_idx on recomendacion_usos (fuente, patron_id);
alter table recomendacion_usos enable row level security;

-- Kardex real (migracion 16): cada movimiento de stock -- venta, compra o
-- ajuste manual -- con el saldo resultante. Stock solo guarda el numero
-- actual; esto guarda el historial. Ver src/lib/stock.ts.
create table movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  producto text not null,
  tipo text not null check (tipo in ('venta', 'compra', 'ajuste')),
  cantidad numeric not null,
  saldo numeric not null,
  motivo text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index movimientos_stock_producto_idx on movimientos_stock (dataset_id, producto, created_at desc);
alter table movimientos_stock enable row level security;
create policy "ver movimientos de stock de mi empresa" on movimientos_stock for select
  using (empresa_id in (select public.mis_empresas()));
create policy "crear movimientos de stock en mi empresa" on movimientos_stock for insert
  with check (empresa_id in (select public.mis_empresas()) and created_by = auth.uid());

-- Notificaciones push de Seguimiento caducado (migracion 18). Ver src/lib/push.ts.
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
alter table push_tokens enable row level security;
create policy "ver mis tokens de push" on push_tokens for select using (user_id = auth.uid());
create policy "crear mis tokens de push" on push_tokens for insert with check (user_id = auth.uid());
create policy "borrar mis tokens de push" on push_tokens for delete using (user_id = auth.uid());

create table seguimiento_clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  cliente_clave text not null,
  cliente_nombre text not null,
  activo boolean not null default true,
  ultima_fecha_cliente text,
  notificado_en timestamptz,
  created_at timestamptz not null default now(),
  unique (dataset_id, cliente_clave)
);
alter table seguimiento_clientes enable row level security;
create policy "ver seguimiento activado de mi empresa" on seguimiento_clientes for select
  using (empresa_id in (select public.mis_empresas()));
create policy "activar seguimiento en mi empresa" on seguimiento_clientes for insert
  with check (empresa_id in (select public.mis_empresas()));
create policy "editar seguimiento de mi empresa" on seguimiento_clientes for update
  using (empresa_id in (select public.mis_empresas()));

-- Notas de la ficha de cliente (migracion 20). Ver src/lib/clientes.ts.
create table notas_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_clave text not null,
  texto text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index notas_cliente_clave_idx on notas_cliente (empresa_id, cliente_clave);
alter table notas_cliente enable row level security;
create policy "ver notas de cliente de mi empresa" on notas_cliente for select
  using (empresa_id in (select public.mis_empresas()));
create policy "crear notas de cliente en mi empresa" on notas_cliente for insert
  with check (empresa_id in (select public.mis_empresas()));
create policy "borrar notas de cliente de mi empresa" on notas_cliente for delete
  using (empresa_id in (select public.mis_empresas()));

-- Ordenes de compra (migracion 20): seguimiento de pedidos a proveedores, aparte
-- de las compras ya registradas. Ver src/app/api/ordenes-compra.
create table ordenes_compra (
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
create policy "ver ordenes de compra de mi empresa" on ordenes_compra for select
  using (empresa_id in (select public.mis_empresas()));
create policy "crear ordenes de compra en mi empresa" on ordenes_compra for insert
  with check (empresa_id in (select public.mis_empresas()));
create policy "editar ordenes de compra de mi empresa" on ordenes_compra for update
  using (empresa_id in (select public.mis_empresas()));
create policy "borrar ordenes de compra de mi empresa" on ordenes_compra for delete
  using (empresa_id in (select public.mis_empresas()));

create table orden_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes_compra(id) on delete cascade,
  producto text not null,
  cantidad numeric not null,
  costo_unitario numeric
);
alter table orden_compra_items enable row level security;
create policy "ver items de ordenes de mi empresa" on orden_compra_items for select
  using (orden_id in (select id from ordenes_compra where empresa_id in (select public.mis_empresas())));
create policy "crear items de ordenes en mi empresa" on orden_compra_items for insert
  with check (orden_id in (select id from ordenes_compra where empresa_id in (select public.mis_empresas())));
create policy "borrar items de ordenes de mi empresa" on orden_compra_items for delete
  using (orden_id in (select id from ordenes_compra where empresa_id in (select public.mis_empresas())));

-- Pipeline de ventas (migracion 22): en que etapa esta cada cliente/prospecto.
-- Ver src/lib/pipeline.ts.
create table etapas_cliente (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  cliente_clave text not null,
  cliente_nombre text not null,
  telefono text,
  etapa text not null default 'prospecto' check (etapa in ('prospecto', 'contactado', 'negociacion', 'cliente', 'perdido')),
  manual boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (empresa_id, cliente_clave)
);
alter table etapas_cliente enable row level security;
create policy "ver etapas de mi empresa" on etapas_cliente for select
  using (empresa_id in (select public.mis_empresas()));
create policy "crear etapas en mi empresa" on etapas_cliente for insert
  with check (empresa_id in (select public.mis_empresas()));
create policy "editar etapas de mi empresa" on etapas_cliente for update
  using (empresa_id in (select public.mis_empresas()));
create policy "borrar etapas de mi empresa" on etapas_cliente for delete
  using (empresa_id in (select public.mis_empresas()));

-- Hitos del negocio (migracion 25): ver src/lib/logros.ts para el catálogo.
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

-- Desde el 30/10/2026 Supabase ya no otorga acceso a la Data API por
-- defecto a tablas nuevas de "public" -- hay que otorgarlo a mano o la API
-- (supabase-js/PostgREST) responde "permission denied". RLS sigue siendo
-- quien de verdad limita qué puede ver/tocar cada usuario; esto solo abre
-- la puerta de la API, igual que ya tenían las tablas creadas antes de esa
-- fecha. anon casi no se usa directo (el catálogo público pasa por una
-- ruta con service_role), pero se otorga igual por si acaso, sin riesgo
-- porque RLS sigue aplicando.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'empresas', 'miembros', 'datasets', 'records', 'suscripciones', 'contactos',
    'metas', 'ia_llamadas', 'highlights', 'recomendacion_usos', 'movimientos_stock',
    'push_tokens', 'seguimiento_clientes', 'notas_cliente', 'ordenes_compra',
    'orden_compra_items', 'etapas_cliente', 'logros'
  ])
  loop
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
