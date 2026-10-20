import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sugerirModulosConIA } from "@/lib/sugerencia-ia";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

const LIMITE_POR_DIA = 3;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Mismo patrón de costo/tope que /api/upload/sugerir-ia (reusa la misma tabla
// ia_llamadas), pero para negocios sin Excel: "documento" acá es la propia
// descripción del negocio, no un nombre de archivo.
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, descripcion } = await request.json();
  if (typeof empresaId !== "string" || typeof descripcion !== "string" || !descripcion.trim()) {
    return NextResponse.json({ error: "Faltan datos: empresaId, descripcion" }, { status: 400 });
  }

  if (!(await tieneSuscripcionActiva(supabase, empresaId))) {
    return NextResponse.json(
      { error: "Sugerir módulos con IA es parte del plan pago. Activa tu suscripción para usarlo." },
      { status: 402 }
    );
  }

  const admin = crearClienteAdmin();
  const documento = `negocio:${descripcion.trim().slice(0, 180)}`;
  const hace1Dia = new Date(Date.now() - UN_DIA_MS).toISOString();
  const { count } = await admin
    .from("ia_llamadas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("documento", documento)
    .gte("created_at", hace1Dia);
  if ((count ?? 0) >= LIMITE_POR_DIA) {
    return NextResponse.json(
      { error: `Ya usaste las ${LIMITE_POR_DIA} sugerencias que permite esta descripción hoy. Prueba de nuevo mañana, o describe tu negocio distinto.` },
      { status: 429 }
    );
  }

  try {
    const modulos = await sugerirModulosConIA(descripcion.trim());
    if (modulos.length === 0) {
      return NextResponse.json({ error: "No se pudo proponer ningún módulo con esa descripción. Intenta dar más detalle." }, { status: 422 });
    }
    await admin.from("ia_llamadas").insert({ empresa_id: empresaId, documento });
    return NextResponse.json({ modulos });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo obtener la sugerencia";
    return NextResponse.json({ error: mensaje }, { status: mensaje.includes("GEMINI_API_KEY") ? 503 : 500 });
  }
}
