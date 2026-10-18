-- Correr esto una vez en Supabase > SQL Editor
alter table suscripciones add column if not exists paypal_subscription_id text;
alter table suscripciones add column if not exists paddle_subscription_id text;
alter table suscripciones add column if not exists pasarela text check (pasarela in ('culqi', 'paypal', 'paddle'));
