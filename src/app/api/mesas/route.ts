import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";

// Mesas persistentes del Punto de Venta (migración 46) -- antes vivían solo
// en memoria del navegador (se perdían al recargar, no se compartían entre
// dispositivos). Cualquier miembro de la empresa puede ver/operar cualquier
// mesa del módulo (no hay candado por mozo asignado, ver migración); mozo_*
// solo deja registro de quién la abrió.
function faltaMigracion(error: { code?: string }) {
  return error.code === "42P01" || error.code === "PGRST205";
}

export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const datasetId = req.nextUrl.searchParams.get("datasetId");
  if (!datasetId) return NextResponse.json({ error: "Falta datasetId" }, { status: 400 });

  const { data, error } = await supabase
    .from("mesas")
    .select("id, nombre, ambiente, cliente, carrito, mozo_email, creada_en")
    .eq("empresa_id", sesion.empresaId)
    .eq("dataset_id", datasetId)
    .order("creada_en");
  if (error) {
    return NextResponse.json({ error: faltaMigracion(error) ? "Falta ejecutar la migración 46 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ mesas: data ?? [] });
}

// Apertura de mesa: el mozo asignado es quien la abre (la sesión autenticada
// actual), no un dato que mande el cliente -- así no se puede falsear.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { datasetId, nombre, ambiente } = await req.json().catch(() => ({}));
  if (typeof datasetId !== "string" || !datasetId) return NextResponse.json({ error: "Falta datasetId" }, { status: 400 });
  if (typeof nombre !== "string" || !nombre.trim()) return NextResponse.json({ error: "Falta el nombre de la mesa" }, { status: 400 });

  const { data, error } = await supabase
    .from("mesas")
    .insert({
      empresa_id: sesion.empresaId,
      dataset_id: datasetId,
      nombre: nombre.trim(),
      ambiente: typeof ambiente === "string" && ambiente.trim() ? ambiente.trim() : "General",
      mozo_user_id: user.id,
      mozo_email: user.email ?? null,
    })
    .select("id, nombre, ambiente, cliente, carrito, mozo_email, creada_en")
    .single();
  if (error) {
    return NextResponse.json({ error: faltaMigracion(error) ? "Falta ejecutar la migración 46 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ mesa: data });
}
