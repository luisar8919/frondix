-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Permite borrar registros y quitar una columna (con sus datos) de una tabla.

drop policy if exists "borrar records de mi empresa" on records;
create policy "borrar records de mi empresa" on records for delete
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

-- Saca la clave de todos los registros de la tabla. Corre con los permisos de quien llama
-- (security invoker), asi que las reglas de acceso siguen aplicando.
create or replace function public.quitar_columna(p_dataset uuid, p_key text) returns void
  language sql security invoker set search_path = public as $$
  update public.records set data = data - p_key, updated_at = now() where dataset_id = p_dataset
$$;

revoke all on function public.quitar_columna(uuid, text) from public, anon;
grant execute on function public.quitar_columna(uuid, text) to authenticated;
