import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { historialCliente } from "@/lib/historialCliente";

// Ficha de cliente: todo lo que compró, juntando cualquier módulo de Ventas que
// tenga columna de Cliente -- ver src/lib/historialCliente.ts.
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const nombre = req.nextUrl.searchParams.get("nombre")?.trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del cliente" }, { status: 400 });

  try {
    const historial = await historialCliente(supabase, sesion.empresaId, nombre);
    return NextResponse.json(historial);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cargar el historial" }, { status: 500 });
  }
}
