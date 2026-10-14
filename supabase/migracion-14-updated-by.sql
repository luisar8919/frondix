-- Correr esto una vez en Supabase > SQL Editor
alter table records add column if not exists updated_by text;
