import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { claveValida } from "@/lib/enlaces";
import type { Columna } from "@/lib/excel-parser";

// RLS ya garantiza que un usuario solo ve/crea records de datasets
// de una empresa donde es miembro — no hace falta chequearlo a mano aquí.

// Supabase corta cada respuesta en 1000 filas: para tablas más grandes hay que
// pedirlas por páginas. Aquí se pide de a `limite` (máx. 1000) y se devuelve el total.
const MAX_PAGINA = 1000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const supabase = await crearClienteServidor();

  const q = req.nextUrl.searchParams;
  const desde = Math.max(0, parseInt(q.get("desde") ?? "0", 10) || 0);
  const limite = Math.min(MAX_PAGINA, Math.max(1, parseInt(q.get("limite") ?? String(MAX_PAGINA), 10) || MAX_PAGINA));

  // "id" desempata registros creados en el mismo instante (una importación los crea juntos);
  // sin eso, una página podría repetir o saltarse filas.
  const { data: records, count, error } = await supabase
    .from("records")
    .select("id, data, created_at", { count: "exact" })
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(desde, desde + limite - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // La primera página trae además los datos de la tabla y las demás tablas de la empresa
  // (para poder mostrar y editar los enlaces entre tablas).
  if (desde > 0) return NextResponse.json({ records, total: count ?? 0 });

  const { data: datasets, error: errorDatasets } = await supabase
    .from("datasets")
    .select("id, nombre, columnas")
    .order("created_at", { ascending: false });
  if (errorDatasets) return NextResponse.json({ error: errorDatasets.message }, { status: 500 });

  const dataset = datasets?.find((d) => d.id === datasetId);
  if (!dataset) return NextResponse.json({ error: "Dataset no encontrado" }, { status: 404 });

  return NextResponse.json({ dataset, otras: datasets.filter((d) => d.id !== datasetId), records, total: count ?? 0 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const supabase = await crearClienteServidor();
  const body = await req.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Si una columna está enlazada a otra tabla, el valor debe existir allí.
  const { data: dataset } = await supabase.from("datasets").select("columnas").eq("id", datasetId).single();
  if (!dataset) return NextResponse.json({ error: "Dataset no encontrado" }, { status: 404 });

  for (const c of dataset.columnas as Columna[]) {
    if (!c.enlace) continue;
    const valor = body[c.key];
    if (valor === null || valor === undefined || valor === "") continue;
    if (!claveValida(c.enlace.columnaKey)) continue;

    const { count } = await supabase
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("dataset_id", c.enlace.datasetId)
      .eq(`data->>${c.enlace.columnaKey}`, String(valor));

    if (!count) {
      return NextResponse.json(
        { error: `"${valor}" no existe en la tabla enlazada a "${c.label}". Agrégalo primero en esa tabla.` },
        { status: 422 }
      );
    }
  }

  const { data, error } = await supabase
    .from("records")
    .insert({ dataset_id: datasetId, data: body })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: data });
}
