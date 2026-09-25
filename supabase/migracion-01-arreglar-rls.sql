-- Para bases que ya corrieron el schema.sql original.
-- Corrige: "infinite recursion detected in policy for relation miembros".
-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.

drop policy if exists "ver mi empresa" on empresas;
drop policy if exists "ver miembros de mi empresa" on miembros;
drop policy if exists "dueno/admin gestiona miembros" on miembros;
drop policy if exists "ver datasets de mi empresa" on datasets;
drop policy if exists "crear datasets en mi empresa" on datasets;
drop policy if exists "ver records de mi empresa" on records;
drop policy if exists "crear records en mi empresa" on records;
drop policy if exists "editar records de mi empresa" on records;
drop policy if exists "ver suscripcion de mi empresa" on suscripciones;

create or replace function public.mis_empresas() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select empresa_id from public.miembros where user_id = auth.uid()
$$;

create or replace function public.mis_empresas_admin() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select empresa_id from public.miembros where user_id = auth.uid() and rol in ('dueno', 'admin')
$$;

revoke all on function public.mis_empresas() from public, anon;
revoke all on function public.mis_empresas_admin() from public, anon;
grant execute on function public.mis_empresas() to authenticated;
grant execute on function public.mis_empresas_admin() to authenticated;

create policy "ver mi empresa" on empresas for select
  using (id in (select public.mis_empresas()));

create policy "ver miembros de mi empresa" on miembros for select
  using (empresa_id in (select public.mis_empresas()));

create policy "dueno/admin gestiona miembros" on miembros for all
  using (empresa_id in (select public.mis_empresas_admin()));

create policy "ver datasets de mi empresa" on datasets for select
  using (empresa_id in (select public.mis_empresas()));

create policy "crear datasets en mi empresa" on datasets for insert
  with check (empresa_id in (select public.mis_empresas()));

create policy "ver records de mi empresa" on records for select
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "crear records en mi empresa" on records for insert
  with check (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "editar records de mi empresa" on records for update
  using (dataset_id in (select id from datasets where empresa_id in (select public.mis_empresas())));

create policy "ver suscripcion de mi empresa" on suscripciones for select
  using (empresa_id in (select public.mis_empresas()));
