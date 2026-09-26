import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { claveValida } from "@/lib/enlaces";

// Valores distintos de una columna: sirven de lista de opciones para las columnas
// enlazadas. Se leen por páginas (Supabase corta en 1000 filas) hasta un tope.
const PAGINA = 1000;
const TOPE_FILAS = 20000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const columna = req.nextUrl.searchParams.get("columna");
  if (!claveValida(columna)) return NextResponse.json({ error: "Columna inválida" }, { status: 400 });

  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const distintos = new Set<string>();
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await supabase
      .from("records")
      .select(`v:data->>${columna}`)
      .eq("dataset_id", datasetId)
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const fila of data as unknown as { v: string | null }[]) {
      const v = fila.v?.trim();
      if (v) distintos.add(v);
    }
    if (data.length < PAGINA) break;
  }

  return NextResponse.json({ valores: [...distintos].sort((a, b) => a.localeCompare(b, "es")) });
}
