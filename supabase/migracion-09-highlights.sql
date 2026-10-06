-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Highlights con IA guardados por empresa: se generan solos (no por boton), como mucho
-- una vez al dia y solo si los numeros cambiaron de verdad -- ver /api/highlights.

create table if not exists highlights (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  contenido jsonb not null, -- array de strings (los puntos)
  huella text not null, -- huella de los datos usados, para saber si vale la pena regenerar
  generado_en timestamptz not null default now()
);

alter table highlights enable row level security;

-- Sin policy de insert/update: solo el servidor (service role) escribe, igual que
-- ia_llamadas. El usuario solo lee los highlights de su propia empresa.
drop policy if exists "ver highlights de mi empresa" on highlights;
create policy "ver highlights de mi empresa" on highlights for select
  using (empresa_id in (select public.mis_empresas()));
