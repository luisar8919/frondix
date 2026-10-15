-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Registra, cada vez que se generan highlights, si el bloque "Recomendacion" salio
-- de un patron determinista (y cual) o de Gemini -- para saber con el tiempo si vale
-- la pena sumar mas patrones al catalogo o si la mayoria de los casos reales no
-- calzan con ninguno todavia. Ver src/lib/patronesRecomendacion.ts y /api/highlights.
-- Solo se lee/escribe desde el servidor con la llave de servicio: sin policies,
-- RLS activado por defecto lo deja cerrado a cualquier otro rol.

create table if not exists recomendacion_usos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  fuente text not null check (fuente in ('patron', 'gemini')),
  patron_id text, -- solo cuando fuente = 'patron' (ver CATALOGO en patronesRecomendacion.ts)
  created_at timestamptz not null default now()
);
create index if not exists recomendacion_usos_fuente_idx on recomendacion_usos (fuente, patron_id);

alter table recomendacion_usos enable row level security;
