import { createClient } from "@supabase/supabase-js";

// Cliente con la service role key: salta Row Level Security.
// Usar SOLO en rutas de servidor para acciones privilegiadas
// (crear la primera empresa de un usuario, invitar miembros por email).
// Nunca importar este archivo desde código que corre en el navegador.
export function crearClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
