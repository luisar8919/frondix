import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// A donde Google (via Supabase Auth) manda de vuelta al usuario después de loguearse.
// Cambia el código de un solo uso por la sesión real (cookies), y de ahí pasa por
// /auth/completar, que decide si ya tiene una empresa o hay que pedirle el nombre.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await crearClienteServidor();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/auth/completar", req.url));
}
