import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";

const LIMITE = 200;

// Historial de auditoría mínimo: quién creó o editó por última vez cada
// registro y cuándo (records.updated_by/updated_at, ver migración 14). No es
// un historial de cambios campo a campo, solo "quién tocó esto último".
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { data: datasets, error: errorDatasets } = await supabase
    .from("datasets")
    .select("id, nombre")
    .eq("empresa_id", sesion.empresaId);
  if (errorDatasets) return NextResponse.json({ error: errorDatasets.message }, { status: 500 });
  const nombrePorDataset = new Map((datasets ?? []).map((d) => [d.id, d.nombre]));
  const datasetIds = (datasets ?? []).map((d) => d.id);
  if (datasetIds.length === 0) return NextResponse.json({ actividad: [] });

  const { data: records, error } = await supabase
    .from("records")
    .select("id, dataset_id, updated_at, updated_by, created_at")
    .in("dataset_id", datasetIds)
    .order("updated_at", { ascending: false })
    .limit(LIMITE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actividad = (records ?? []).map((r) => ({
    recordId: r.id,
    datasetId: r.dataset_id,
    datasetNombre: nombrePorDataset.get(r.dataset_id) ?? "?",
    actualizadoEn: r.updated_at,
    actualizadoPor: r.updated_by,
    esNuevo: r.created_at === r.updated_at,
  }));

  return NextResponse.json({ actividad });
}
