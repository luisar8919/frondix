import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

// Fijar (o actualizar) la meta de ventas de un producto en un módulo. RLS exige que
// el dataset sea de una empresa donde el usuario es miembro -- no hace falta
// comprobarlo a mano aquí, una fila que no es suya simplemente no se encuentra/inserta.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { datasetId, producto, cantidadObjetivo } = await req.json().catch(() => ({}));
  if (!datasetId || typeof producto !== "string" || !producto.trim()) {
    return NextResponse.json({ error: "Faltan datos: datasetId, producto" }, { status: 400 });
  }
  const cantidad = Number(cantidadObjetivo);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: "La meta debe ser un número entero mayor a 0" }, { status: 400 });
  }

  const { data: dataset } = await supabase.from("datasets").select("empresa_id").eq("id", datasetId).single();
  if (!dataset) return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });

  const { data: meta, error } = await supabase
    .from("metas")
    .upsert(
      { empresa_id: dataset.empresa_id, dataset_id: datasetId, producto: producto.trim(), cantidad_objetivo: cantidad, created_by: user.id },
      { onConflict: "dataset_id,producto" }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ meta });
}
