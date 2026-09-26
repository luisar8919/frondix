import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { claveValida } from "@/lib/enlaces";
import type { Columna, EnlaceColumna } from "@/lib/excel-parser";

// Guarda qué columnas de esta tabla están enlazadas a columnas de otras tablas.
// Body: { enlaces: { "<columnaKey>": { datasetId, columnaKey } | null } }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { enlaces } = (await req.json()) as { enlaces?: Record<string, EnlaceColumna | null> };
  if (!enlaces || typeof enlaces !== "object") {
    return NextResponse.json({ error: "Falta el campo enlaces" }, { status: 400 });
  }

  // RLS solo deja ver las tablas de la propia empresa: un id ajeno simplemente no aparece.
  const { data: datasets } = await supabase.from("datasets").select("id, columnas");
  const actual = datasets?.find((d) => d.id === datasetId);
  if (!actual) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

  const columnas = actual.columnas as Columna[];
  for (const [clave, enlace] of Object.entries(enlaces)) {
    if (!columnas.some((c) => c.key === clave)) {
      return NextResponse.json({ error: `La columna "${clave}" no existe en esta tabla` }, { status: 400 });
    }
    if (enlace === null) continue;

    if (enlace.datasetId === datasetId) {
      return NextResponse.json({ error: "Una columna no puede enlazarse con su propia tabla" }, { status: 400 });
    }
    const destino = datasets?.find((d) => d.id === enlace.datasetId);
    if (!destino) return NextResponse.json({ error: "La tabla de destino no existe" }, { status: 400 });
    if (!claveValida(enlace.columnaKey) || !(destino.columnas as Columna[]).some((c) => c.key === enlace.columnaKey)) {
      return NextResponse.json({ error: "La columna de destino no existe" }, { status: 400 });
    }
  }

  const nuevas = columnas.map((c) => {
    if (!(c.key in enlaces)) return c;
    const e = enlaces[c.key];
    return { ...c, enlace: e ? { datasetId: e.datasetId, columnaKey: e.columnaKey } : null };
  });

  // Si el usuario no es dueño/admin, la regla de la base no deja actualizar ninguna fila.
  const { data: actualizadas, error } = await supabase
    .from("datasets")
    .update({ columnas: nuevas })
    .eq("id", datasetId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!actualizadas || actualizadas.length === 0) {
    return NextResponse.json({ error: "Solo el dueño o un administrador puede enlazar tablas" }, { status: 403 });
  }

  return NextResponse.json({ columnas: nuevas });
}
