import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { calcularModulosReporte, ultimosMovimientos, resumenTributarioMes } from "@/lib/datosReportes";

const MES_VALIDO = /^\d{4}-\d{2}$/;

// Reportes prehechos: para cada módulo con roles marcados, arma solo lo que aplica
// (total por mes si hay Monto+Fecha; top 5 si hay Producto o Cliente). Sin configurar nada.
// `?mes=2026-10` (opcional): trae TODOS los movimientos de ese mes (no solo los últimos
// 50) y el resumen tributario (ventas/compras gravadas + IGV) para declarar ese mes.
export async function GET(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const mesParam = request.nextUrl.searchParams.get("mes");
  const mes = mesParam && MES_VALIDO.test(mesParam) ? mesParam : undefined;

  try {
    const [modulos, movimientos] = await Promise.all([
      calcularModulosReporte(supabase, sesion.empresaId),
      ultimosMovimientos(supabase, sesion.empresaId, mes ? { mes } : undefined),
    ]);
    const resumen = mes ? resumenTributarioMes(movimientos, mes) : null;
    return NextResponse.json({ modulos, movimientos, resumen });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron calcular los reportes" }, { status: 500 });
  }
}
