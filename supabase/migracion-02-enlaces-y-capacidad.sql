-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.

-- 1) Enlaces entre tablas: dueno/admin pueden editar la estructura de una tabla
--    (los enlaces se guardan dentro de datasets.columnas).
drop policy if exists "dueno/admin edita datasets" on datasets;
create policy "dueno/admin edita datasets" on datasets for update
  using (empresa_id in (select public.mis_empresas_admin()))
  with check (empresa_id in (select public.mis_empresas_admin()));

-- 1b) Dueno/admin pueden borrar una tabla (sus registros se borran en cascada). Tambien lo
--     usa la importacion para deshacer una tabla que quedo a medias si algo falla.
drop policy if exists "dueno/admin borra datasets" on datasets;
create policy "dueno/admin borra datasets" on datasets for delete
  using (empresa_id in (select public.mis_empresas_admin()));

-- 2) Capacidad: indices para paginar las tablas grandes y acelerar las reglas de acceso.
create index if not exists datasets_empresa_idx on datasets (empresa_id);
create index if not exists records_dataset_creado_idx on records (dataset_id, created_at desc);
drop index if exists records_dataset_idx; -- lo reemplaza el indice de arriba

-- 3) Ninguna consulta usa el indice GIN sobre "data" y ocupa casi tanto espacio como
--    los propios datos: se elimina para poder guardar mas registros en el mismo plan.
drop index if exists records_data_gin;
