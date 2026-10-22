import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { claveValida } from "@/lib/enlaces";
import type { Columna } from "@/lib/excel-parser";

// Historial de abonos de UNA venta a crédito puntual.
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const recordId = req.nextUrl.searchParams.get("recordId");
  if (!recordId) return NextResponse.json({ error: "Falta recordId" }, { status: 400 });

  const { data, error } = await supabase
    .from("abonos")
    .select("id, monto, fecha, notas, created_at")
    .eq("empresa_id", sesion.empresaId)
    .eq("record_id", recordId)
    .order("fecha", { ascending: false });
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 28 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ abonos: data ?? [] });
}

// Registra un abono: resta el monto del "Saldo pendiente" de ESA fila (nunca
// baja de 0, un abono de más se recorta -- no tiene sentido un saldo
// negativo) y guarda el abono como historial.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { datasetId, recordId, monto, notas } = await req.json().catch(() => ({}));
  const montoNum = Number(monto);
  if (typeof datasetId !== "string" || typeof recordId !== "string") {
    return NextResponse.json({ error: "Faltan datos: datasetId, recordId" }, { status: 400 });
  }
  if (!Number.isFinite(montoNum) || montoNum <= 0) {
    return NextResponse.json({ error: "El abono debe ser mayor a 0" }, { status: 400 });
  }

  const { data: dataset } = await supabase.from("datasets").select("columnas").eq("id", datasetId).eq("empresa_id", sesion.empresaId).single();
  if (!dataset) return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
  const columnas = dataset.columnas as Columna[];
  const cSaldo = columnas.find((c) => c.rol === "saldo_pendiente" && claveValida(c.key));
  if (!cSaldo) return NextResponse.json({ error: "Este módulo no tiene columna de Saldo pendiente" }, { status: 422 });

  const { data: record } = await supabase.from("records").select("data").eq("id", recordId).eq("dataset_id", datasetId).single();
  if (!record) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

  const saldoActual = Number((record.data as Record<string, unknown>)[cSaldo.key]) || 0;
  const nuevoSaldo = Math.max(0, Math.round((saldoActual - montoNum) * 100) / 100);

  const { error: errorUpdate } = await supabase
    .from("records")
    .update({ data: { ...(record.data as object), [cSaldo.key]: nuevoSaldo }, updated_by: user.email ?? null })
    .eq("id", recordId);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  const { error: errorAbono } = await supabase.from("abonos").insert({
    empresa_id: sesion.empresaId,
    dataset_id: datasetId,
    record_id: recordId,
    monto: montoNum,
    notas: typeof notas === "string" && notas.trim() ? notas.trim() : null,
    created_by: user.id,
  });
  if (errorAbono) {
    const faltaMigracion = errorAbono.code === "42P01" || errorAbono.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 28 en Supabase." : errorAbono.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nuevoSaldo });
}
