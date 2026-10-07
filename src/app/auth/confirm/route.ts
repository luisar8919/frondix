import { NextRequest, NextResponse } from "next/server";

// A donde Supabase manda al usuario al hacer clic en cualquier enlace de correo
// (confirmar cuenta, invitación, etc -- requiere la plantilla de email en
// Supabase, ver README). NO verifica el token acá -- antes sí, y eso rompía las
// invitaciones: Outlook/Hotmail ("Safe Links") y otros escáneres de correo abren
// los enlaces del mensaje con un GET antes de que la persona lo haga, para
// revisarlos por seguridad; si la verificación pasa en ese GET, el escáner
// consume el token de un solo uso y el usuario real llega con un enlace ya
// gastado (visto en vivo: invitación a un @hotmail.com que "no tenía cuenta").
// La verificación real pasa en /auth/confirmar, que exige un clic humano.
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");

  const host = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");

  if (!tokenHash || !type) return NextResponse.redirect(`${proto}://${host}/login`);
  return NextResponse.redirect(
    `${proto}://${host}/auth/confirmar?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`
  );
}
