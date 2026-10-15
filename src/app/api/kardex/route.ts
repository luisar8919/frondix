import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";

// Historial de movimientos de UN producto en un módulo de Stock (venta, compra
// o ajuste manual, cada uno con el saldo resultante) -- ver migracion-16 y
// src/lib/stock.ts. El filtro por empresa lo da RLS (movimientos_stock solo
// se puede leer de la propia empresa), acá solo se filtra dataset+producto.
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const datasetId = req.nextUrl.searchParams.get("datasetId");
  const producto = req.nextUrl.searchParams.get("producto");
  if (!datasetId || !producto) return NextResponse.json({ error: "Falta datasetId o producto" }, { status: 400 });

  const { data, error } = await supabase
    .from("movimientos_stock")
    .select("id, tipo, cantidad, saldo, motivo, created_at")
    .eq("dataset_id", datasetId)
    .eq("producto", producto)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json(
      { error: faltaMigracion ? "Falta ejecutar la migración 16 en Supabase." : error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ movimientos: data });
}
