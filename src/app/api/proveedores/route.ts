import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { listaProveedores } from "@/lib/proveedores";
import { normalizarTexto } from "@/lib/seguimiento";

// Espejo de /api/clientes: lista (ficha de proveedor) y alta manual (antes de
// la primera compra, ver proveedores_manual).
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  try {
    const proveedores = await listaProveedores(supabase, sesion.empresaId);
    return NextResponse.json({ proveedores });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo cargar la lista de proveedores";
    const faltaMigracion = mensaje.includes("42P01") || mensaje.includes("PGRST205");
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 26 en Supabase." : mensaje }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { nombre, telefono } = await req.json().catch(() => ({}));
  if (typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "Falta el nombre del proveedor" }, { status: 400 });
  }

  const { error } = await supabase.from("proveedores_manual").upsert(
    { empresa_id: sesion.empresaId, clave: normalizarTexto(nombre), nombre: nombre.trim(), telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null },
    { onConflict: "empresa_id,clave" }
  );
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 26 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
