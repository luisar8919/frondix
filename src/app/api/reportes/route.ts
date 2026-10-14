import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { calcularModulosReporte, ultimosMovimientos } from "@/lib/datosReportes";

// Reportes prehechos: para cada módulo con roles marcados, arma solo lo que aplica
// (total por mes si hay Monto+Fecha; top 5 si hay Producto o Cliente). Sin configurar nada.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  try {
    const [modulos, movimientos] = await Promise.all([
      calcularModulosReporte(supabase, sesion.empresaId),
      ultimosMovimientos(supabase, sesion.empresaId),
    ]);
    return NextResponse.json({ modulos, movimientos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron calcular los reportes" }, { status: 500 });
  }
}
