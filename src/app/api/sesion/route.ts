import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";

// Para la app nativa de Android: no hay "cookie de empresa activa" como en la
// web (ver COOKIE_EMPRESA_ACTIVA en lib/sesion.ts), así que esto le da de una
// la empresa que le toca al usuario y su rol en ella.
export async function GET() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const empresa = sesion.empresas.find((e) => e.empresaId === sesion.empresaId);
  const { data: datosEmpresa } = await supabase.from("empresas").select("telefono").eq("id", sesion.empresaId).single();

  return NextResponse.json({
    empresaId: sesion.empresaId,
    empresaNombre: empresa?.nombre ?? "tu negocio",
    empresaTelefono: datosEmpresa?.telefono ?? null,
    rol: empresa?.rol ?? null,
    email: user?.email ?? null,
    ultimoIngreso: user?.last_sign_in_at ?? null,
  });
}
