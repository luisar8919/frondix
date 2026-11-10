import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { listaClientes } from "@/lib/clientes";
import { normalizarTexto } from "@/lib/seguimiento";

// Lista de clientes (ficha de cliente): todos los que compraron algo, con su
// última visita, cuántas veces y cuánto gastaron en total.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  try {
    const clientes = await listaClientes(supabase, sesion.empresaId);
    return NextResponse.json({ clientes });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cargar la lista de clientes" }, { status: 500 });
  }
}

// Espejo de POST /api/proveedores: agregar un cliente a mano (antes de su
// primera compra), o editar el teléfono de uno que ya tiene compras -- el
// upsert por nombre normalizado hace las 2 cosas con la misma llamada.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { nombre, telefono } = await req.json().catch(() => ({}));
  if (typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "Falta el nombre del cliente" }, { status: 400 });
  }

  const { error } = await supabase.from("clientes_manual").upsert(
    { empresa_id: sesion.empresaId, clave: normalizarTexto(nombre), nombre: nombre.trim(), telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null },
    { onConflict: "empresa_id,clave" }
  );
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 31 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
