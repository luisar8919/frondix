import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { cuentasPorCobrar } from "@/lib/cuentasPorCobrar";

export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  try {
    const cuentas = await cuentasPorCobrar(supabase, sesion.empresaId);
    return NextResponse.json({ cuentas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron calcular las cuentas por cobrar" }, { status: 500 });
  }
}
