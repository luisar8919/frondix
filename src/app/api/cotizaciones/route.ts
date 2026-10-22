import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";

// Cotizaciones: un paso antes de la venta confirmada. Cualquier rol que
// registra ventas (dueño, admin, vendedor) también puede cotizar -- a
// diferencia de Órdenes de compra, acá no hay costos ni proveedores que
// esconderle a un vendedor.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { data, error } = await supabase
    .from("cotizaciones")
    .select("id, cliente, producto, monto, fecha, estado, notas, venta_dataset_id, created_at")
    .eq("empresa_id", sesion.empresaId)
    .order("created_at", { ascending: false });
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 27 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ cotizaciones: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { cliente, producto, monto, fecha, notas } = await req.json().catch(() => ({}));
  if (typeof cliente !== "string" || !cliente.trim()) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });
  if (typeof producto !== "string" || !producto.trim()) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 });

  const { data, error } = await supabase
    .from("cotizaciones")
    .insert({
      empresa_id: sesion.empresaId,
      cliente: cliente.trim(),
      producto: producto.trim(),
      monto: montoNum,
      fecha: typeof fecha === "string" && fecha ? fecha : new Date().toISOString().slice(0, 10),
      notas: typeof notas === "string" && notas.trim() ? notas.trim() : null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 27 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cotizacionId: data.id });
}
