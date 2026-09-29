import type { SupabaseClient } from "@supabase/supabase-js";

export const MENSAJE_SESION_VENCIDA = "Tu sesión venció. Recarga la página e inicia sesión de nuevo.";

// Supabase rota el "refresh token" de la sesión; el que quedó guardado en el navegador
// (otra pestaña vieja, dos pestañas refrescando casi a la vez) a veces deja de servir,
// y getUser() devuelve null en vez de tirar un error. Sin este chequeo, el código de
// cada página asumía que el usuario existía y explotaba con un mensaje confuso.
export async function empresaDelUsuario(
  supabase: SupabaseClient
): Promise<{ ok: true; empresaId: string } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: MENSAJE_SESION_VENCIDA };

  const { data: miembro } = await supabase.from("miembros").select("empresa_id").eq("user_id", user.id).single();
  if (!miembro) return { ok: false, error: "No se pudo identificar tu empresa. Recarga la página e intenta de nuevo." };

  return { ok: true, empresaId: miembro.empresa_id };
}
