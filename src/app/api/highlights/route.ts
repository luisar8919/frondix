import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { calcularModulosReporte, resumenParaIA } from "@/lib/datosReportes";
import { generarHighlights } from "@/lib/gemini";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

// Cada llamada cuesta dinero real en la API de Gemini (aunque sea poco: solo se le
// manda el resumen ya calculado, nunca filas crudas). Mismo tope y misma tabla de
// conteo que "Sugerir con IA", para no abrir un segundo medidor por separado.
const LIMITE_POR_HORA = 10;

export async function POST() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: miembro } = await supabase.from("miembros").select("empresa_id").eq("user_id", user.id).limit(1).single();
  if (!miembro) return NextResponse.json({ error: "No tienes una empresa asociada" }, { status: 404 });
  const empresaId = miembro.empresa_id;

  if (!(await tieneSuscripcionActiva(supabase, empresaId))) {
    return NextResponse.json(
      { error: "Los highlights con IA son parte del plan pago. Activa tu suscripción para usarlos." },
      { status: 402 }
    );
  }

  const admin = crearClienteAdmin();
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("ia_llamadas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .gte("created_at", haceUnaHora);
  if ((count ?? 0) >= LIMITE_POR_HORA) {
    return NextResponse.json(
      { error: `Ya usaste las ${LIMITE_POR_HORA} llamadas a IA que permite tu empresa esta hora. Intenta de nuevo más tarde.` },
      { status: 429 }
    );
  }

  try {
    const modulos = await calcularModulosReporte(supabase, empresaId);
    const resumen = resumenParaIA(modulos);
    const highlights = await generarHighlights(resumen);
    await admin.from("ia_llamadas").insert({ empresa_id: empresaId });
    return NextResponse.json({ highlights });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudieron generar los highlights";
    return NextResponse.json({ error: mensaje }, { status: mensaje.includes("GEMINI_API_KEY") ? 503 : 500 });
  }
}
