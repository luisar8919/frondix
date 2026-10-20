import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { cuentasPorPagar } from "@/lib/cuentasPorPagar";

// Lo que le debés a tus proveedores: cualquier módulo de Compras con columna
// "Saldo pendiente" y valor mayor a 0. Se muestra en Inicio.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  try {
    const resultado = await cuentasPorPagar(supabase, sesion.empresaId);
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo calcular cuentas por pagar" }, { status: 500 });
  }
}
