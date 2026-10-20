-- Correr esto una vez en Supabase > SQL Editor
alter table datasets add column if not exists moneda text not null default 'PEN' check (moneda in ('PEN', 'USD'));
