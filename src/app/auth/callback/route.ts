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

  // OJO: nunca armar la URL de vuelta con `req.url` tal cual. Detrás del proxy de
  // Azure Static Web Apps, Next.js ve la petición como si llegara a un servidor
  // interno (localhost:8080), no a tu dominio público — usar req.url manda al
  // usuario a su propia máquina en vez de a Frondix. Los headers x-forwarded-*
  // son los que traen la dirección pública real.
  const host = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return NextResponse.redirect(`${proto}://${host}/auth/completar`);
}
