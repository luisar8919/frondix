import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// RLS ya garantiza que un usuario solo ve/crea records de datasets
// de una empresa donde es miembro — no hace falta chequearlo a mano acá.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const supabase = await crearClienteServidor();

  const { data: dataset, error: errorDataset } = await supabase
    .from("datasets")
    .select("id, nombre, columnas")
    .eq("id", datasetId)
    .single();
  if (errorDataset || !dataset) {
    return NextResponse.json({ error: "Dataset no encontrado" }, { status: 404 });
  }

  const { data: records, error: errorRecords } = await supabase
    .from("records")
    .select("id, data, created_at")
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: false });
  if (errorRecords) {
    return NextResponse.json({ error: errorRecords.message }, { status: 500 });
  }

  return NextResponse.json({ dataset, records });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const supabase = await crearClienteServidor();
  const body = await req.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("records")
    .insert({ dataset_id: datasetId, data: body })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data });
}
