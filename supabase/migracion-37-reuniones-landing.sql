-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Reservas agendadas desde el landing publico (/, seccion "Agenda una reunion") --
-- tabla independiente de empresas/usuarios (no pertenece a ningun tenant), sin
-- ninguna policy de RLS: con RLS activado y cero policies, nadie con la clave
-- publica (anon/authenticated) puede leer ni escribir -- solo el cliente admin
-- (service role, salta RLS) desde /api/landing/agendar-reunion.
create table if not exists reuniones_landing (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  correo text not null,
  rubro text,
  mensaje text,
  fecha date not null,
  horario text not null,
  creado_en timestamptz not null default now()
);
alter table reuniones_landing enable row level security;
