-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Nuevo rol "mozo": igual de restringido que "vendedor" (nada de costos,
-- compras, reportes, clientes/proveedores, pipeline, etc. -- ver
-- rolRestringido() en permisos.ts) y ADEMAS sin acceso a Resumen/Seguimiento/
-- Configuracion -- su unica pantalla es el Punto de Venta (Interfaces).
-- Pensado para el mesero que abre una mesa y toma pedidos.

alter table miembros drop constraint if exists miembros_rol_check;
alter table miembros add constraint miembros_rol_check check (rol in ('dueno', 'admin', 'miembro', 'vendedor', 'mozo'));
