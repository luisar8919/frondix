import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { normalizarTexto } from "@/lib/seguimiento";

// Notas de la ficha de cliente: texto libre, nada que ver con los módulos de
// Ventas (se guarda por cliente_clave, no por fila de ningún dataset).
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const nombre = req.nextUrl.searchParams.get("nombre")?.trim();
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del cliente" }, { status: 400 });

  const { data, error } = await supabase
    .from("notas_cliente")
    .select("id, texto, created_at")
    .eq("empresa_id", sesion.empresaId)
    .eq("cliente_clave", normalizarTexto(nombre))
    .order("created_at", { ascending: false });
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 20 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ notas: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { nombre, texto } = await req.json().catch(() => ({}));
  if (typeof nombre !== "string" || !nombre.trim() || typeof texto !== "string" || !texto.trim()) {
    return NextResponse.json({ error: "Faltan datos: nombre, texto" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("notas_cliente")
    .insert({ empresa_id: sesion.empresaId, cliente_clave: normalizarTexto(nombre), texto: texto.trim(), created_by: user.id })
    .select("id, texto, created_at")
    .single();
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 20 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ nota: data });
}
