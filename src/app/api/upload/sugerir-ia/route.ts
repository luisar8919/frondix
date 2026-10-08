import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { agruparHojas } from "@/lib/excel-parser";
import { sugerirEstructuraConIA } from "@/lib/sugerencia-ia";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

// Cada llamada cuesta tokens reales de la API de Gemini; este tope es por
// DOCUMENTO (identificado por su nombre de archivo, ver migracion-13), no por
// empresa -- así alguien puede seguir pidiendo sugerencias para un Excel
// distinto el mismo día, pero no insistir sin límite sobre el mismo archivo.
const LIMITE_POR_DOCUMENTO = 3;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Re-parsea el mismo archivo (no se guarda nada entre pasos) y le pide a Gemini una
// mejor etiqueta y rol para las columnas de un grupo puntual. Requiere sesión, para
// no dejar este endpoint (que cuesta dinero por llamada) abierto sin autenticar, y
// plan pago: cada llamada le cuesta real a Frondix, no solo al usuario.
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const form = await request.formData();
  const archivo = form.get("archivo");
  const grupoIndex = parseInt(String(form.get("grupoIndex") ?? ""), 10);
  const empresaId = form.get("empresaId");
  if (!(archivo instanceof File) || Number.isNaN(grupoIndex) || typeof empresaId !== "string") {
    return NextResponse.json({ error: "Faltan datos: archivo, grupoIndex o empresaId" }, { status: 400 });
  }

  if (!(await tieneSuscripcionActiva(supabase, empresaId))) {
    return NextResponse.json(
      { error: "Sugerir estructura con IA es parte del plan pago. Activa tu suscripción para usarlo." },
      { status: 402 }
    );
  }

  const documento = archivo.name.slice(0, 200);
  const admin = crearClienteAdmin();
  const hace1Dia = new Date(Date.now() - UN_DIA_MS).toISOString();
  const { count } = await admin
    .from("ia_llamadas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("documento", documento)
    .gte("created_at", hace1Dia);
  if ((count ?? 0) >= LIMITE_POR_DOCUMENTO) {
    return NextResponse.json(
      { error: `Ya usaste las ${LIMITE_POR_DOCUMENTO} sugerencias por IA que permite este documento hoy. Prueba de nuevo mañana, o con otro archivo.` },
      { status: 429 }
    );
  }

  let grupos;
  try {
    // Mismo tope que /api/upload/grupos y /api/upload/auto: tiene que coincidir,
    // si no, grupoIndex (la pestaña que el cliente ve) apunta a otro grupo acá.
    ({ grupos } = agruparHojas(await archivo.arrayBuffer(), 6));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer el Excel" }, { status: 422 });
  }
  const grupo = grupos[grupoIndex];
  if (!grupo) return NextResponse.json({ error: "Ese grupo ya no existe" }, { status: 400 });

  try {
    const columnas = await sugerirEstructuraConIA(
      grupo.columnas.map((c) => ({ key: c.key, labelActual: c.label })),
      grupo.filas
    );
    await admin.from("ia_llamadas").insert({ empresa_id: empresaId, documento }); // solo se cuenta lo que sí costó
    return NextResponse.json({ columnas });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo obtener la sugerencia";
    return NextResponse.json({ error: mensaje }, { status: mensaje.includes("GEMINI_API_KEY") ? 503 : 500 });
  }
}
