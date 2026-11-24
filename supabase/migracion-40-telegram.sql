-- Correr esto una vez en Supabase > SQL Editor
alter table empresas add column if not exists telegram_chat_id text;
