import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { pipelineCompleto } from "@/lib/pipeline";
import { normalizarTexto } from "@/lib/seguimiento";

export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  try {
    const tarjetas = await pipelineCompleto(supabase, sesion.empresaId);
    return NextResponse.json({ tarjetas });
  } catch (e) {
    const faltaMigracion = e instanceof Error && /relation .* does not exist|PGRST205/.test(e.message);
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 22 en Supabase." : (e instanceof Error ? e.message : "No se pudo cargar el pipeline") }, { status: 500 });
  }
}

// Agrega un prospecto nuevo (todavía sin ninguna compra, por eso se carga a
// mano en vez de salir de un módulo de Ventas).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { nombre, telefono } = await req.json().catch(() => ({}));
  if (typeof nombre !== "string" || !nombre.trim()) {
    return NextResponse.json({ error: "Falta el nombre del prospecto" }, { status: 400 });
  }

  const { error } = await supabase.from("etapas_cliente").insert({
    empresa_id: sesion.empresaId,
    cliente_clave: normalizarTexto(nombre),
    cliente_nombre: nombre.trim(),
    telefono: telefono?.trim() || null,
    etapa: "prospecto",
    manual: true,
  });
  if (error) {
    const yaExiste = error.code === "23505";
    return NextResponse.json({ error: yaExiste ? "Ya hay un cliente o prospecto con ese nombre" : error.message }, { status: yaExiste ? 409 : 500 });
  }

  return NextResponse.json({ ok: true });
}
