import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

// Anota que ya se le escribió a un cliente, para no volver a proponérselo al dueño enseguida.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { datasetId, cliente, mensaje } = await req.json();
  if (typeof datasetId !== "string" || typeof cliente !== "string" || !cliente.trim()) {
    return NextResponse.json({ error: "Faltan datos: datasetId y cliente" }, { status: 400 });
  }

  // RLS solo deja ver las tablas de la propia empresa: de ahí sale la empresa, no del cliente.
  const { data: dataset } = await supabase.from("datasets").select("empresa_id").eq("id", datasetId).single();
  if (!dataset) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

  if (!(await tieneSuscripcionActiva(supabase, dataset.empresa_id))) {
    return NextResponse.json({ error: "El seguimiento por WhatsApp es parte del plan pago." }, { status: 402 });
  }

  const { error } = await supabase.from("contactos").insert({
    empresa_id: dataset.empresa_id,
    dataset_id: datasetId,
    cliente: cliente.trim().slice(0, 200),
    mensaje: typeof mensaje === "string" ? mensaje.slice(0, 2000) : null,
    created_by: user.id,
  });
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json(
      { error: faltaMigracion ? "Falta ejecutar la migración 03 en Supabase." : error.message },
      { status: faltaMigracion ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
