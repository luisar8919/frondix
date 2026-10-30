import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { tipoModulo, type TipoModulo } from "@/lib/roles";
import type { Columna } from "@/lib/excel-parser";

// Para la app nativa: lista los módulos de la empresa, opcionalmente
// filtrados por tipo (mismo filtro tipoModulo que ya usa
// dashboard/ventas/registrar y dashboard/compras/registrar del lado web).
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const tipoParam = req.nextUrl.searchParams.get("tipo") as TipoModulo | null;

  const { data: datasets, error } = await supabase
    .from("datasets")
    .select("id, nombre, columnas, created_at")
    .eq("empresa_id", sesion.empresaId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filtrados = (datasets ?? []).filter(
    (d) => !tipoParam || tipoModulo((d.columnas as Columna[]).map((c) => c.rol), d.nombre) === tipoParam
  );

  return NextResponse.json({
    datasets: filtrados.map((d) => ({ id: d.id, nombre: d.nombre, createdAt: d.created_at })),
  });
}
