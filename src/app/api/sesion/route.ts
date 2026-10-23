import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";

// Para la app nativa de Android: no hay "cookie de empresa activa" como en la
// web (ver COOKIE_EMPRESA_ACTIVA en lib/sesion.ts), así que esto le da de una
// la empresa que le toca al usuario y su rol en ella.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const empresa = sesion.empresas.find((e) => e.empresaId === sesion.empresaId);
  return NextResponse.json({
    empresaId: sesion.empresaId,
    empresaNombre: empresa?.nombre ?? "tu negocio",
    rol: empresa?.rol ?? null,
  });
}
