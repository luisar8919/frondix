import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { planEliminarTabla, planificarCambios, type ColumnaPropuesta } from "@/lib/estructura";
import type { DatasetResumen } from "@/lib/enlaces";
import type { SupabaseClient } from "@supabase/supabase-js";

// Editar la estructura de una tabla (nombre, campos) o eliminarla. Solo dueño/admin: la regla
// de la base no deja actualizar ni borrar a otros. Si el cambio afecta enlaces con otras
// tablas, la primera llamada responde 409 con `advertencias` y hay que reenviar con `confirmar: true`.
type Ctx = { params: Promise<{ datasetId: string }> };

async function cargar(ctx: Ctx) {
  const { datasetId } = await ctx.params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const { data: todas } = await supabase.from("datasets").select("id, nombre, columnas");
  const actual = (todas ?? []).find((d) => d.id === datasetId) as DatasetResumen | undefined;
  if (!actual) return { error: NextResponse.json({ error: "Tabla no encontrada" }, { status: 404 }) };
  return { supabase, datasetId, actual, otras: (todas ?? []).filter((d) => d.id !== datasetId) as DatasetResumen[] };
}

const SOLO_ADMIN = "Solo el dueño o un administrador puede modificar la estructura de las tablas";

// Quita el enlace de columnas de OTRAS tablas que apuntaban a lo que se borró.
async function romperEnlaces(supabase: SupabaseClient, otras: DatasetResumen[], rotos: { datasetId: string; columnaKey: string }[]) {
  for (const id of new Set(rotos.map((r) => r.datasetId))) {
    const claves = new Set(rotos.filter((r) => r.datasetId === id).map((r) => r.columnaKey));
    const d = otras.find((x) => x.id === id)!;
    const columnas = d.columnas.map((c) => (claves.has(c.key) ? { ...c, enlace: null } : c));
    await supabase.from("datasets").update({ columnas }).eq("id", id);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const c = await cargar(ctx);
  if ("error" in c) return c.error;
  const { supabase, datasetId, actual, otras } = c;

  const { nombre, columnas, confirmar } = (await req.json().catch(() => ({}))) as {
    nombre?: string;
    columnas?: ColumnaPropuesta[];
    confirmar?: boolean;
  };

  const nombreFinal = (nombre ?? actual.nombre).trim();
  if (!nombreFinal || nombreFinal.length > 120) {
    return NextResponse.json({ error: "El nombre de la tabla debe tener entre 1 y 120 letras." }, { status: 400 });
  }

  let plan = { columnas: actual.columnas, eliminadas: [] as string[], enlacesARomper: [] as { datasetId: string; columnaKey: string }[], advertencias: [] as string[] };
  if (columnas) {
    const r = planificarCambios(actual.columnas, columnas, nombreFinal, datasetId, otras);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    plan = r;
  }
  if (plan.advertencias.length && !confirmar) return NextResponse.json({ advertencias: plan.advertencias }, { status: 409 });

  const { data: actualizadas, error } = await supabase
    .from("datasets")
    .update({ nombre: nombreFinal, columnas: plan.columnas })
    .eq("id", datasetId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!actualizadas?.length) return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 });

  await romperEnlaces(supabase, otras, plan.enlacesARomper);
  for (const key of plan.eliminadas) {
    const { error: e } = await supabase.rpc("quitar_columna", { p_dataset: datasetId, p_key: key });
    if (e) {
      return NextResponse.json(
        { error: `La estructura se guardó, pero no se pudieron borrar los datos del campo quitado (¿falta ejecutar la migración 04?): ${e.message}` },
        { status: 500 }
      );
    }
  }
  return NextResponse.json({ nombre: nombreFinal, columnas: plan.columnas });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const c = await cargar(ctx);
  if ("error" in c) return c.error;
  const { supabase, datasetId, actual, otras } = c;

  const { confirmar } = await req.json().catch(() => ({}));
  const plan = planEliminarTabla(datasetId, actual.nombre, otras);
  if (!confirmar) return NextResponse.json({ advertencias: plan.advertencias }, { status: 409 });

  const { data: borradas, error } = await supabase.from("datasets").delete().eq("id", datasetId).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!borradas?.length) return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 });

  await romperEnlaces(supabase, otras, plan.enlacesARomper);
  return NextResponse.json({ ok: true });
}
