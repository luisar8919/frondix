import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { modulosStock, stockCombinado } from "@/lib/datosReportes";

// Qué módulos "parecen" Stock y sus productos -- para el selector de Kardex en
// /dashboard/inventario. Separado de /api/reportes para no calcular Ventas/Compras
// (mucho más pesado) solo para mostrar esto.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  try {
    const [stock, combinado] = await Promise.all([
      modulosStock(supabase, sesion.empresaId),
      stockCombinado(supabase, sesion.empresaId),
    ]);
    return NextResponse.json({ stock, combinado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo calcular el inventario" }, { status: 500 });
  }
}
