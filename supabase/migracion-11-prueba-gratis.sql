-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- Prueba gratis de 3 meses: toda empresa nueva arranca con el plan completo
-- activo hasta prueba_hasta -- tieneSuscripcionActiva() la trata como activa
-- mientras no haya pasado esa fecha. Si paga de verdad, prueba_hasta se limpia
-- (null) y queda activa para siempre, sin depender de ninguna fecha.

alter table suscripciones add column if not exists prueba_hasta timestamptz;
