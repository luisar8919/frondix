import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { ETAPAS } from "@/lib/pipeline";

// Cambia la etapa de un cliente/prospecto. Si es la primera vez que se le toca
// la etapa a un cliente que YA existe en Ventas, esto crea la fila (antes su
// etapa "cliente" era implícita, ahora queda guardada explícitamente).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ clave: string }> }) {
  const { clave } = await params;
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { etapa, nombre } = await req.json().catch(() => ({}));
  if (!ETAPAS.includes(etapa)) return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });
  if (typeof nombre !== "string" || !nombre.trim()) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  const { error } = await supabase.from("etapas_cliente").upsert(
    { empresa_id: sesion.empresaId, cliente_clave: decodeURIComponent(clave), cliente_nombre: nombre.trim(), etapa, updated_at: new Date().toISOString() },
    { onConflict: "empresa_id,cliente_clave" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
