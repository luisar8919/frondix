import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Guarda el token de FCM del dispositivo actual -- se llama desde la app
// (solo corre dentro del WebView nativo, ver componente RegistrarPush) justo
// después de que Capacitor confirma el registro en Firebase.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "Falta el token" }, { status: 400 });
  }

  const { error } = await supabase.from("push_tokens").upsert({ user_id: user.id, token: token.trim() }, { onConflict: "user_id,token" });
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 18 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
