import type { SupabaseClient } from "@supabase/supabase-js";

// Paquetes extra comprables cuando una empresa llega a su tope mensual.
// Precio con margen real sobre el costo de FactPro (S/0.02-0.04/doc según tramo):
// 50 docs cuestan ~S/2 real, 200 cuestan ~S/8 real.
export const PAQUETES_FACTURACION = {
  50: 8, // soles
  200: 20,
} as const;

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Si cambió el mes desde la última vez, resetea el contador y los extras
// comprados (el paquete extra vale solo para el ciclo en que se compró).
async function asegurarCiclo(supabase: SupabaseClient, empresaId: string) {
  const ciclo = mesActual();
  const { data } = await supabase.from("empresas").select("factpro_ciclo").eq("id", empresaId).single();
  if (data?.factpro_ciclo === ciclo) return;
  await supabase
    .from("empresas")
    .update({ factpro_ciclo: ciclo, factpro_documentos_usados: 0, factpro_extra_mes: 0 })
    .eq("id", empresaId);
}

// Tope duro: llamar ANTES de emitir un comprobante. Si devuelve permitido=false,
// no se debe llamar a emitirComprobante() de factpro.ts.
export async function verificarLimite(supabase: SupabaseClient, empresaId: string) {
  await asegurarCiclo(supabase, empresaId);
  const { data: empresa } = await supabase
    .from("empresas")
    .select("factpro_limite_base, factpro_documentos_usados, factpro_extra_mes")
    .eq("id", empresaId)
    .single();
  if (!empresa) return { permitido: false, restantes: 0 };

  const tope = empresa.factpro_limite_base + empresa.factpro_extra_mes;
  const restantes = tope - empresa.factpro_documentos_usados;
  return { permitido: restantes > 0, restantes: Math.max(0, restantes), tope, usados: empresa.factpro_documentos_usados };
}

// Llamar DESPUÉS de emitir con éxito, para descontar del tope.
export async function registrarEmision(supabase: SupabaseClient, empresaId: string) {
  await asegurarCiclo(supabase, empresaId);
  const { data: empresa } = await supabase.from("empresas").select("factpro_documentos_usados").eq("id", empresaId).single();
  await supabase
    .from("empresas")
    .update({ factpro_documentos_usados: (empresa?.factpro_documentos_usados ?? 0) + 1 })
    .eq("id", empresaId);
}

// Suma un paquete comprado al ciclo actual (llamar tras confirmar el cobro en Culqi).
export async function agregarPaqueteExtra(supabase: SupabaseClient, empresaId: string, tamano: keyof typeof PAQUETES_FACTURACION) {
  await asegurarCiclo(supabase, empresaId);
  const { data: empresa } = await supabase.from("empresas").select("factpro_extra_mes").eq("id", empresaId).single();
  await supabase
    .from("empresas")
    .update({ factpro_extra_mes: (empresa?.factpro_extra_mes ?? 0) + tamano })
    .eq("id", empresaId);
}
