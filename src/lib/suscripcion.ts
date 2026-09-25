import type { SupabaseClient } from "@supabase/supabase-js";

// Gratis: tablas y filas ilimitadas, un solo usuario, sin WhatsApp.
// Pago: lo que agregamos acá — invitar gente y mandar WhatsApp.
export async function tieneSuscripcionActiva(
  supabase: SupabaseClient,
  empresaId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("suscripciones")
    .select("estado")
    .eq("empresa_id", empresaId)
    .single();
  return data?.estado === "activa";
}
