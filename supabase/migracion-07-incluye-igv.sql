-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Si las ventas de un modulo ya traen el IGV (18%) incluido o no: lo decide el
-- usuario por modulo (no se puede asumir uno solo, depende del negocio), y el
-- reporte de flujo de caja lo usa para calcular el IGV correctamente.

alter table datasets add column if not exists incluye_igv boolean not null default false;
