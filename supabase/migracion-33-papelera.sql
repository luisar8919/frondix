-- Papelera: en vez de borrar un registro directo, se marca con eliminado_en.
-- Las listas normales (GET /api/records) siguen filtrando eliminado_en is null,
-- así que un registro en la papelera desaparece de la vista normal sin perder
-- los datos -- se puede restaurar o borrar definitivamente desde ahí.
alter table records add column if not exists eliminado_en timestamptz;

create index if not exists records_eliminado_en_idx on records (dataset_id, eliminado_en);
