-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- SMTP propio por empresa, para mandar los correos al CLIENTE del negocio
-- (ver enviar_correo_cliente, lib/email.ts) desde su propia casilla en vez
-- de avisos@frondix.com. La contraseña NUNCA se guarda en texto plano (ver
-- lib/cifrado.ts) -- esta columna guarda el texto ya cifrado.
alter table empresas add column if not exists smtp_host text;
alter table empresas add column if not exists smtp_port integer;
alter table empresas add column if not exists smtp_usuario text;
alter table empresas add column if not exists smtp_password_cifrado text;
alter table empresas add column if not exists smtp_from text;
alter table empresas add column if not exists smtp_activo boolean not null default false;
