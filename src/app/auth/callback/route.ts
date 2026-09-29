import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// A donde Google (via Supabase Auth) manda de vuelta al usuario después de loguearse.
// Cambia el código de un solo uso por la sesión real (cookies), y de ahí pasa por
// /auth/completar, que decide si ya tiene una empresa o hay que pedirle el nombre.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  // OJO: nunca armar la URL de vuelta con `req.url` tal cual. Detrás del proxy de
  // Azure Static Web Apps, Next.js ve la petición como si llegara a un servidor
  // interno (localhost:8080), no a tu dominio público — usar req.url manda al
  // usuario a su propia máquina en vez de a Frondix. Los headers x-forwarded-*
  // son los que traen la dirección pública real.
  const host = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const response = NextResponse.redirect(`${proto}://${host}/auth/completar`);

  if (code) {
    // Cliente propio (no el genérico de src/lib/supabase/server.ts): ese envuelve el
    // guardado de cookies en un try/catch pensado para Server Components, donde
    // escribir cookies no está permitido y el error se ignora a propósito. Aquí SÍ
    // estamos en un Route Handler, donde sí se puede — así que las cookies de la
    // sesión se escriben directo sobre la respuesta que ya vamos a devolver, sin
    // pasar por ese try/catch que podría estar tapando un error real.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) =>
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
        },
      }
    );
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      // TEMPORAL: mientras depuramos el login con Google, mandamos el motivo real del
      // error a /login en vez de tragárnoslo. Quitar este bloque una vez que funcione.
      if (error) return NextResponse.redirect(`${proto}://${host}/login?google_error=${encodeURIComponent(error.message)}`);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "desconocido";
      return NextResponse.redirect(`${proto}://${host}/login?google_error=${encodeURIComponent(mensaje)}`);
    }
  }

  return response;
}
