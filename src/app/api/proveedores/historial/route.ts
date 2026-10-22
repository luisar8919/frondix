import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { historialProveedor } from "@/lib/proveedores";

// Espejo de /api/clientes/historial. Un vendedor no ve Compras (costos,
// proveedores), ver src/lib/permisos.ts, así que tampoco ve esta ficha.
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const nombre = req.nextUrl.searchParams.get("nombre");
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del proveedor" }, { status: 400 });

  try {
    const historial = await historialProveedor(supabase, sesion.empresaId, nombre);
    return NextResponse.json(historial);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cargar el historial" }, { status: 500 });
  }
}
