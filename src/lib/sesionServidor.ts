import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { misEmpresas, elegirEmpresa, COOKIE_EMPRESA_ACTIVA, type EmpresaDeUsuario } from "./sesion";

// Igual que empresaDelUsuario (src/lib/sesion.ts), pero para Server Components y
// Route Handlers: la cookie de la empresa elegida se lee con next/headers en vez
// de document.cookie (que no existe en el servidor).
export async function empresaDelUsuarioServidor(
  supabase: SupabaseClient
): Promise<{ ok: true; empresaId: string; empresas: EmpresaDeUsuario[] } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const empresas = await misEmpresas(supabase, user.id);
  if (empresas.length === 0) return { ok: false, error: "No se pudo identificar tu empresa." };

  const preferida = (await cookies()).get(COOKIE_EMPRESA_ACTIVA)?.value;
  const elegida = elegirEmpresa(empresas, preferida);
  return { ok: true, empresaId: elegida.empresaId, empresas };
}
