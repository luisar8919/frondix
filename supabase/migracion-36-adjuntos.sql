-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Adjuntar archivos (foto de boleta, contrato, radiografia, plano...) a un
-- registro cualquiera -- el bucket de Storage "adjuntos" ya se creo via API
-- (privado). Nunca se habla con Storage directo desde el navegador: todo pasa
-- por /api/adjuntos con el cliente de servicio, que valida membresia a mano
-- (mismo criterio que el SMTP propio) -- por eso esta tabla no necesita
-- policies de Storage para funcionar, solo esta tabla de metadatos.
create table if not exists adjuntos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  record_id uuid not null references records(id) on delete cascade,
  ruta_storage text not null,
  nombre_archivo text not null,
  tipo_mime text,
  tamano_bytes integer,
  subido_por text,
  created_at timestamptz not null default now()
);
alter table adjuntos enable row level security;

drop policy if exists "ver adjuntos de mi empresa" on adjuntos;
create policy "ver adjuntos de mi empresa" on adjuntos for select
  using (empresa_id in (select public.mis_empresas()));
