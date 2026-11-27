-- Correr esto una vez en Supabase > SQL Editor
-- Interfaces (Punto de Venta, Atención) apagadas a mano desde Configuración >
-- Interfaces, sin importar si estructuralmente aplican. Default vacío: todo
-- lo que aplique se muestra, como hasta ahora.
alter table empresas add column if not exists interfaces_desactivadas text[] not null default '{}';
