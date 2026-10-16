-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Notificaciones push (app movil) cuando un cliente con seguimiento activado
-- cruza el umbral de "no volvio". Ver src/lib/push.ts y /api/cron/seguimiento-push.

-- Token de FCM del dispositivo de cada usuario (un usuario puede tener varios:
-- celular nuevo, reinstalo la app, etc. -- se mandan todos, el que ya no sirve
-- Firebase lo rechaza y se borra solo, ver push.ts).
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);
alter table push_tokens enable row level security;

drop policy if exists "ver mis tokens de push" on push_tokens;
create policy "ver mis tokens de push" on push_tokens for select
  using (user_id = auth.uid());
drop policy if exists "crear mis tokens de push" on push_tokens;
create policy "crear mis tokens de push" on push_tokens for insert
  with check (user_id = auth.uid());
drop policy if exists "borrar mis tokens de push" on push_tokens;
create policy "borrar mis tokens de push" on push_tokens for delete
  using (user_id = auth.uid());

-- Qué clientes el dueño activó para seguimiento -- totalmente opcional, por
-- cliente (checkbox en la pantalla de Seguimiento). ultima_fecha_cliente y
-- notificado_en evitan mandar el mismo aviso en cada corrida del cron: solo
-- se notifica UNA VEZ por cada vez que el cliente "se queda callado" (si
-- vuelve a comprar, se resetea y puede volver a avisar más adelante).
create table if not exists seguimiento_clientes (
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

drop policy if exists "ver seguimiento activado de mi empresa" on seguimiento_clientes;
create policy "ver seguimiento activado de mi empresa" on seguimiento_clientes for select
  using (empresa_id in (select public.mis_empresas()));
drop policy if exists "activar seguimiento en mi empresa" on seguimiento_clientes;
create policy "activar seguimiento en mi empresa" on seguimiento_clientes for insert
  with check (empresa_id in (select public.mis_empresas()));
drop policy if exists "editar seguimiento de mi empresa" on seguimiento_clientes;
create policy "editar seguimiento de mi empresa" on seguimiento_clientes for update
  using (empresa_id in (select public.mis_empresas()));
