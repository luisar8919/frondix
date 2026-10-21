import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { revisarYObtenerLogros } from "@/lib/logros";

// Revisa (y guarda, si corresponde) los hitos del negocio cada vez que se pide
// esta pantalla -- no hay un trigger por acción, se detecta "en frío" leyendo
// los mismos datos que ya existen (ver src/lib/logros.ts).
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const empresaId = req.nextUrl.searchParams.get("empresaId") ?? sesion.empresaId;
  const pagado = await tieneSuscripcionActiva(supabase, empresaId);

  try {
    const logros = await revisarYObtenerLogros(supabase, empresaId, pagado);
    return NextResponse.json({ logros, pagado });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo revisar los logros";
    const faltaMigracion = mensaje.includes("42P01") || mensaje.includes("PGRST205");
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 25 en Supabase." : mensaje }, { status: 500 });
  }
}
