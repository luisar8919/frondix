import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { advertenciasDeRegistro, validarEnlaces } from "@/lib/dependientes";
import type { Columna } from "@/lib/excel-parser";

// Editar o eliminar un registro. Si otras tablas dependen de su valor, la primera llamada
// responde 409 con `advertencias`; el cliente reintenta con `confirmar: true` si el usuario acepta.
type Ctx = { params: Promise<{ datasetId: string; recordId: string }> };

async function cargar(ctx: Ctx) {
  const { datasetId, recordId } = await ctx.params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };

  const { data: registro } = await supabase
    .from("records")
    .select("id, data")
    .eq("id", recordId)
    .eq("dataset_id", datasetId)
    .single();
  if (!registro) return { error: NextResponse.json({ error: "Registro no encontrado" }, { status: 404 }) };
  return { supabase, datasetId, recordId, registro };
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const c = await cargar(ctx);
  if ("error" in c) return c.error;
  const { supabase, datasetId, recordId, registro } = c;

  const { data, confirmar } = await req.json().catch(() => ({}));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { data: dataset } = await supabase.from("datasets").select("columnas").eq("id", datasetId).single();
  if (!dataset) return NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 });

  const fallo = await validarEnlaces(supabase, dataset.columnas as Columna[], data);
  if (fallo) return NextResponse.json({ error: fallo }, { status: 422 });

  if (!confirmar) {
    const advertencias = await advertenciasDeRegistro(supabase, datasetId, recordId, registro.data, data);
    if (advertencias.length) return NextResponse.json({ advertencias }, { status: 409 });
  }

  const { data: actualizado, error } = await supabase
    .from("records")
    .update({ data, updated_at: new Date().toISOString() })
    .eq("id", recordId)
    .select("id, data, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ record: actualizado });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const c = await cargar(ctx);
  if ("error" in c) return c.error;
  const { supabase, datasetId, recordId, registro } = c;

  const { confirmar } = await req.json().catch(() => ({}));
  if (!confirmar) {
    const advertencias = await advertenciasDeRegistro(supabase, datasetId, recordId, registro.data, null);
    if (advertencias.length) return NextResponse.json({ advertencias }, { status: 409 });
  }

  const { data: borrados, error } = await supabase.from("records").delete().eq("id", recordId).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!borrados?.length) {
    return NextResponse.json({ error: "No se pudo eliminar (falta ejecutar la migración 04 en Supabase)." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
