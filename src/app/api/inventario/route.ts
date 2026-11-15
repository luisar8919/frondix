import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { modulosStock, stockCombinado } from "@/lib/datosReportes";
import { esStock, transferirStock } from "@/lib/stock";
import type { Columna } from "@/lib/excel-parser";

// Qué módulos "parecen" Stock y sus productos -- para el selector de Kardex en
// /dashboard/inventario. Separado de /api/reportes para no calcular Ventas/Compras
// (mucho más pesado) solo para mostrar esto.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  try {
    const [stock, combinado] = await Promise.all([
      modulosStock(supabase, sesion.empresaId),
      stockCombinado(supabase, sesion.empresaId),
    ]);
    return NextResponse.json({ stock, combinado });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo calcular el inventario" }, { status: 500 });
  }
}

// Traslado nativo entre 2 módulos de Stock (ver transferirStock en lib/stock.ts) --
// antes la única forma era armar 2 ajustes manuales sin relación entre sí.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }
  const { data: { user } } = await supabase.auth.getUser();

  const { origenDatasetId, destinoDatasetId, producto, cantidad } = await req.json().catch(() => ({}));
  if (!origenDatasetId || !destinoDatasetId || origenDatasetId === destinoDatasetId) {
    return NextResponse.json({ error: "Elige 2 almacenes distintos" }, { status: 400 });
  }
  const cantidadNum = Number(cantidad);
  if (typeof producto !== "string" || !producto.trim() || !(cantidadNum > 0)) {
    return NextResponse.json({ error: "Falta el producto o la cantidad" }, { status: 400 });
  }

  const { data: datasets, error } = await supabase
    .from("datasets")
    .select("id, nombre, columnas")
    .eq("empresa_id", sesion.empresaId)
    .in("id", [origenDatasetId, destinoDatasetId]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origenDs = datasets?.find((d) => d.id === origenDatasetId);
  const destinoDs = datasets?.find((d) => d.id === destinoDatasetId);
  if (!origenDs || !destinoDs) return NextResponse.json({ error: "Almacén no encontrado" }, { status: 404 });
  if (!esStock(origenDs.columnas as Columna[]) || !esStock(destinoDs.columnas as Columna[])) {
    return NextResponse.json({ error: "Ambos deben ser módulos de Stock" }, { status: 422 });
  }
  const cProductoOrigen = (origenDs.columnas as Columna[]).find((c) => c.rol === "producto");
  const cProductoDestino = (destinoDs.columnas as Columna[]).find((c) => c.rol === "producto");
  if (!cProductoOrigen || !cProductoDestino) return NextResponse.json({ error: "Falta la columna Producto en algún almacén" }, { status: 422 });

  try {
    await transferirStock(
      supabase,
      sesion.empresaId,
      { datasetId: origenDs.id, claveProducto: cProductoOrigen.key, nombre: origenDs.nombre },
      { datasetId: destinoDs.id, claveProducto: cProductoDestino.key, nombre: destinoDs.nombre },
      producto.trim(),
      cantidadNum,
      user?.id ?? null
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo trasladar el stock" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
