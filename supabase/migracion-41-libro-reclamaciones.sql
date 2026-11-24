-- Correr esto una vez en Supabase > SQL Editor
-- Libro de Reclamaciones Virtual (requisito INDECOPI, D.S. 101-2022-PCM):
-- campos minimos exigidos por ley para un reclamo/queja de consumidor.
-- Publico (sin empresa_id ni usuario asociado -- lo llena cualquier visitante
-- de la web, no un cliente logueado de Frondix).
create table if not exists libro_reclamaciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  tipo text not null check (tipo in ('reclamo', 'queja')),
  nombre text not null,
  apellido text not null,
  documento_tipo text not null,
  documento_numero text not null,
  domicilio text not null,
  telefono text,
  correo text not null,
  es_menor_edad boolean not null default false,
  tutor_nombre text,
  bien_contratado text not null,
  monto numeric,
  descripcion text not null,
  pedido text not null,
  respuesta text,
  respondido_en timestamptz,
  created_at timestamptz not null default now()
);

alter table libro_reclamaciones enable row level security;
-- Sin politicas de SELECT/INSERT para anon/authenticated: el formulario publico
-- inserta via service role (api/libro-reclamaciones/crear), y la pantalla de
-- gestion (dueno/admin) lee tambien via service role -- misma razon que
-- seguimiento_clientes y demas tablas que ya se manejan 100% server-side.
