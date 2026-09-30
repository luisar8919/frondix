import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

// A donde Supabase manda al usuario al hacer clic en el enlace de "confirma tu
// correo" (requiere cambiar la plantilla de email en Supabase, ver README).
// Mismo patrón que /auth/callback: arma la URL con los headers x-forwarded-*
// (nunca req.url, ver ese archivo) y escribe las cookies directo en la respuesta.
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;

  const host = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const response = NextResponse.redirect(`${proto}://${host}/auth/completar`);

  if (tokenHash && type) {
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
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return NextResponse.redirect(`${proto}://${host}/login?error=${encodeURIComponent(error.message)}`);
  }

  return response;
}
