import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";

// Órdenes de compra: seguimiento de lo que le pediste a un proveedor, aparte
// de las compras ya registradas en un módulo (eso es lo que YA compraste;
// esto es lo que está en camino). No ajusta stock ni crea un registro de
// Compras solo: eso lo hace el dueño a mano cuando de verdad llega el pedido,
// para no inventar un monto/costo que todavía no es seguro.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("ordenes_compra")
    .select("id, proveedor, estado, fecha_pedido, fecha_recepcion, notas, orden_compra_items(id, producto, cantidad, costo_unitario)")
    .eq("empresa_id", sesion.empresaId)
    .order("fecha_pedido", { ascending: false });
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 20 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ ordenes: data ?? [] });
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

  const { proveedor, notas, items } = await req.json().catch(() => ({}));
  if (typeof proveedor !== "string" || !proveedor.trim()) {
    return NextResponse.json({ error: "Falta el proveedor" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Agrega al menos un producto" }, { status: 400 });
  }
  for (const it of items) {
    if (typeof it.producto !== "string" || !it.producto.trim() || !Number.isFinite(Number(it.cantidad)) || Number(it.cantidad) <= 0) {
      return NextResponse.json({ error: "Cada producto necesita nombre y una cantidad mayor a 0" }, { status: 400 });
    }
  }

  const { data: orden, error: errorOrden } = await supabase
    .from("ordenes_compra")
    .insert({ empresa_id: sesion.empresaId, proveedor: proveedor.trim(), notas: notas?.trim() || null, created_by: user.id })
    .select("id")
    .single();
  if (errorOrden) {
    const faltaMigracion = errorOrden.code === "42P01" || errorOrden.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 20 en Supabase." : errorOrden.message }, { status: 500 });
  }

  const { error: errorItems } = await supabase.from("orden_compra_items").insert(
    items.map((it: { producto: string; cantidad: number; costoUnitario?: number }) => ({
      orden_id: orden.id,
      producto: it.producto.trim(),
      cantidad: Number(it.cantidad),
      costo_unitario: it.costoUnitario ? Number(it.costoUnitario) : null,
    }))
  );
  if (errorItems) {
    // La orden ya quedó creada pero sin items -- mejor avisar que dejarla a medias en silencio.
    return NextResponse.json({ error: `Orden creada pero no se pudieron guardar los productos: ${errorItems.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ordenId: orden.id });
}
