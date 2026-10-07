import type { SupabaseClient } from "@supabase/supabase-js";

export const MENSAJE_SESION_VENCIDA = "Tu sesión venció. Recarga la página e inicia sesión de nuevo.";

// Nombre de la cookie (normal, no httpOnly: solo guarda una preferencia de UI,
// nunca un permiso -- el acceso real siempre lo decide RLS comparando user_id,
// nunca esta cookie) donde se guarda qué empresa eligió ver un usuario que
// pertenece a más de una (invitado a gestionar otro negocio además del suyo).
export const COOKIE_EMPRESA_ACTIVA = "empresa_activa";

export interface EmpresaDeUsuario {
  empresaId: string;
  nombre: string;
  rol: string;
}

// Trae TODAS las empresas del usuario (antes era .single(), que tiraba error
// -- y dejaba al usuario sin poder entrar -- en cuanto pertenecía a más de una).
// Ordenadas por antigüedad de membresía para que, sin cookie de preferencia,
// el resultado sea siempre el mismo (la primera a la que entró) y no dependa
// del orden arbitrario que devuelva la base.
export async function misEmpresas(supabase: SupabaseClient, userId: string): Promise<EmpresaDeUsuario[]> {
  const { data } = await supabase
    .from("miembros")
    .select("empresa_id, rol, created_at, empresas(nombre)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((m) => ({
    empresaId: m.empresa_id as string,
    nombre: (m.empresas as unknown as { nombre: string } | null)?.nombre ?? "",
    rol: m.rol as string,
  }));
}

// De la lista de empresas del usuario, cuál mostrar: la que eligió (si sigue
// siendo miembro de ella) o, si no, la más antigua.
export function elegirEmpresa(empresas: EmpresaDeUsuario[], preferidaId: string | undefined): EmpresaDeUsuario {
  return empresas.find((e) => e.empresaId === preferidaId) ?? empresas[0];
}

function leerCookie(nombre: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(nombre + "="))
    ?.slice(nombre.length + 1);
}

// Para código de cliente ("use client"): guarda la empresa activa elegida en el
// selector (ver BarraPanel) y recarga -- navegación dura, para que el servidor
// (páginas/rutas que leen la cookie) la vea en la siguiente carga.
export function elegirEmpresaActiva(empresaId: string) {
  document.cookie = `${COOKIE_EMPRESA_ACTIVA}=${empresaId}; path=/; max-age=31536000; samesite=lax`;
  window.location.href = "/dashboard";
}

// Sin middleware en Azure Static Web Apps, Supabase rota el "refresh token" y a
// veces el guardado en el navegador deja de servir: getUser() devuelve null en
// vez de tirar un error. Sin este chequeo, cada página asumía que el usuario
// existía y explotaba con un mensaje confuso.
export async function empresaDelUsuario(
  supabase: SupabaseClient
): Promise<{ ok: true; empresaId: string; empresas: EmpresaDeUsuario[] } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: MENSAJE_SESION_VENCIDA };

  const empresas = await misEmpresas(supabase, user.id);
  if (empresas.length === 0) return { ok: false, error: "No se pudo identificar tu empresa. Recarga la página e intenta de nuevo." };

  const elegida = elegirEmpresa(empresas, leerCookie(COOKIE_EMPRESA_ACTIVA));
  return { ok: true, empresaId: elegida.empresaId, empresas };
}
