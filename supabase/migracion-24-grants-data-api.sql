-- Supabase avisó que desde el 30/10/2026 deja de otorgar acceso a la Data
-- API por defecto a tablas nuevas de "public" (las existentes no se tocan,
-- pero conviene dejar esto explícito ya, y lo necesita cualquier reset/
-- branch de Supabase que recree el esquema). Ver schema.sql, mismo bloque.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'empresas', 'miembros', 'datasets', 'records', 'suscripciones', 'contactos',
    'metas', 'ia_llamadas', 'highlights', 'recomendacion_usos', 'movimientos_stock',
    'push_tokens', 'seguimiento_clientes', 'notas_cliente', 'ordenes_compra',
    'orden_compra_items', 'etapas_cliente'
  ])
  loop
    execute format('grant select on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
