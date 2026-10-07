import type { SupabaseClient } from "@supabase/supabase-js";

// Gratis: tablas y filas ilimitadas, un solo usuario, sin WhatsApp.
// Pago: lo que agregamos aquí — invitar gente y mandar WhatsApp.
//
// Toda empresa nueva arranca con 3 meses de prueba gratis del plan pago (ver
// /api/empresas/create): mientras prueba_hasta no haya pasado, estado="activa"
// cuenta como plan pago aunque nunca haya pagado. Al pagar de verdad (checkout o
// webhook de Culqi), prueba_hasta se limpia (null) y queda activa sin fecha límite.
export async function tieneSuscripcionActiva(
  supabase: SupabaseClient,
  empresaId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("suscripciones")
    .select("estado, prueba_hasta")
    .eq("empresa_id", empresaId)
    .single();
  if (data?.estado !== "activa") return false;
  return !data.prueba_hasta || new Date(data.prueba_hasta) > new Date();
}
