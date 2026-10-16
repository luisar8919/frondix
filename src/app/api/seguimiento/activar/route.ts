import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { normalizarTexto } from "@/lib/seguimiento";

// Activa/desactiva el seguimiento (push a la app) de UN cliente puntual. Se
// guarda por dataset_id + clave normalizada del nombre -- mismo criterio que
// ya usa agruparClientes para identificar al mismo cliente entre filas.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  const empresaId = sesion.empresaId;

  const { datasetId, nombre, activo } = await req.json().catch(() => ({}));
  if (!datasetId || typeof nombre !== "string" || !nombre.trim() || typeof activo !== "boolean") {
    return NextResponse.json({ error: "Faltan datos: datasetId, nombre, activo" }, { status: 400 });
  }

  const clave = normalizarTexto(nombre);
  const { error } = await supabase
    .from("seguimiento_clientes")
    .upsert(
      { empresa_id: empresaId, dataset_id: datasetId, cliente_clave: clave, cliente_nombre: nombre.trim(), activo },
      { onConflict: "dataset_id,cliente_clave" }
    );
  if (error) {
    const faltaMigracion = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json({ error: faltaMigracion ? "Falta ejecutar la migración 18 en Supabase." : error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
