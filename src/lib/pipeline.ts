import type { SupabaseClient } from "@supabase/supabase-js";
import { listaClientes } from "./clientes.ts";

export type Etapa = "prospecto" | "contactado" | "negociacion" | "cliente" | "perdido";
export const ETAPAS: Etapa[] = ["prospecto", "contactado", "negociacion", "cliente", "perdido"];

export interface TarjetaPipeline {
  clave: string;
  nombre: string;
  telefono: string | null;
  etapa: Etapa;
  manual: boolean; // true = prospecto cargado a mano, todavía sin ninguna compra
  totalGastado: number;
}

// El pipeline junta dos fuentes: los clientes que YA compraron algo (vienen de
// Ventas, listaClientes) -- si nadie les cambió la etapa a mano, se asume que
// están en "cliente" porque ya compraron -- y los prospectos cargados a mano
// en etapas_cliente (gente que todavía no compró nada, por eso no aparecen en
// ningún módulo de Ventas).
export async function pipelineCompleto(supabase: SupabaseClient, empresaId: string): Promise<TarjetaPipeline[]> {
  const [clientes, { data: etapas, error }] = await Promise.all([
    listaClientes(supabase, empresaId),
    supabase.from("etapas_cliente").select("cliente_clave, cliente_nombre, telefono, etapa, manual").eq("empresa_id", empresaId),
  ]);
  if (error) throw new Error(error.message);

  const etapaPorClave = new Map((etapas ?? []).map((e) => [e.cliente_clave, e]));
  const tarjetas: TarjetaPipeline[] = clientes.map((c) => {
    const e = etapaPorClave.get(c.clave);
    return { clave: c.clave, nombre: c.nombre, telefono: c.telefono, etapa: (e?.etapa as Etapa) ?? "cliente", manual: false, totalGastado: c.totalGastado };
  });

  const clavesDeVentas = new Set(clientes.map((c) => c.clave));
  for (const e of etapas ?? []) {
    if (clavesDeVentas.has(e.cliente_clave)) continue; // ya está arriba, con su propio total
    tarjetas.push({ clave: e.cliente_clave, nombre: e.cliente_nombre, telefono: e.telefono, etapa: e.etapa as Etapa, manual: true, totalGastado: 0 });
  }

  return tarjetas;
}
