-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Nuevo rol "vendedor": solo registra ventas y consulta stock, sin ver costos,
-- compras, reportes financieros ni poder subir/editar modulos. Ver permisos.ts.

alter table miembros drop constraint if exists miembros_rol_check;
alter table miembros add constraint miembros_rol_check check (rol in ('dueno', 'admin', 'miembro', 'vendedor'));
