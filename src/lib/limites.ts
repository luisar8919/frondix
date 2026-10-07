import type { SupabaseClient } from "@supabase/supabase-js";
import { misEmpresas } from "./sesion.ts";
import { tieneSuscripcionActiva } from "./suscripcion.ts";

// Tope de empresas por USUARIO (no por empresa): cuántas puede crear/gestionar
// como dueño, y a cuántas más puede aceptar ser invitado (admin o miembro en
// una empresa que no es suya). "Pagado" acá es del usuario, no de una empresa
// puntual: paga si es dueño de AL MENOS una empresa con suscripción activa
// (real o en prueba, ver tieneSuscripcionActiva) -- esa persona desbloquea el
// tope más alto para todas las empresas que gestiona, no solo para esa.
export interface LimitesEmpresas {
  maxPropias: number;
  maxInvitado: number;
  propias: number;
  invitado: number;
  pagado: boolean;
}

const LIMITES_GRATIS = { maxPropias: 1, maxInvitado: 2 };
const LIMITES_PAGO = { maxPropias: 5, maxInvitado: 10 };

export async function limitesDelUsuario(supabase: SupabaseClient, userId: string): Promise<LimitesEmpresas> {
  const empresas = await misEmpresas(supabase, userId);
  const propias = empresas.filter((e) => e.rol === "dueno");
  const invitado = empresas.filter((e) => e.rol !== "dueno");

  let pagado = false;
  for (const e of propias) {
    if (await tieneSuscripcionActiva(supabase, e.empresaId)) {
      pagado = true;
      break;
    }
  }

  const limites = pagado ? LIMITES_PAGO : LIMITES_GRATIS;
  return { ...limites, propias: propias.length, invitado: invitado.length, pagado };
}
