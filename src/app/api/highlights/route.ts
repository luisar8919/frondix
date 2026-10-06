import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { calcularModulosReporte, resumenConRecientesParaIA, huellaModulos } from "@/lib/datosReportes";
import { generarHighlights } from "@/lib/gemini";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

// Tope defensivo de respaldo (ver abajo: en la práctica, con el límite de una vez al
// día, una empresa no debería acercarse a esto nunca).
const LIMITE_POR_HORA = 10;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Se genera solo (nadie aprieta un botón), se guarda en la base, y solo se vuelve a
// llamar a Gemini si pasó al menos un día Y los números cambiaron de verdad -- esa
// decisión la toma la plataforma comparando una huella, nunca preguntándole a la IA
// "¿cambió algo?" (eso sería gastar una llamada para decidir si gastar otra llamada).
export async function GET() {
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

  try {
    const modulos = await calcularModulosReporte(supabase, empresaId);
    const huellaActual = huellaModulos(modulos);

    const { data: guardado } = await admin.from("highlights").select("*").eq("empresa_id", empresaId).maybeSingle();

    const pasoUnDia = !guardado || Date.now() - new Date(guardado.generado_en).getTime() >= UN_DIA_MS;
    const cambioAlgo = !guardado || guardado.huella !== huellaActual;

    // Ya hay uno guardado y no corresponde regenerar: se devuelve tal cual, sin
    // tocar Gemini ni el contador de uso.
    if (guardado && !(pasoUnDia && cambioAlgo)) {
      return NextResponse.json({ highlights: guardado.contenido, generadoEl: guardado.generado_en, nuevo: false });
    }

    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ia_llamadas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .gte("created_at", haceUnaHora);
    if ((count ?? 0) >= LIMITE_POR_HORA) {
      // No debería pasar nunca con el límite de un día, pero si pasa, se devuelve
      // lo último guardado (si hay) en vez de cortar la pantalla con un error.
      if (guardado) return NextResponse.json({ highlights: guardado.contenido, generadoEl: guardado.generado_en, nuevo: false });
      return NextResponse.json({ error: "Demasiadas llamadas a IA esta hora. Intenta de nuevo más tarde." }, { status: 429 });
    }

    const resumen = await resumenConRecientesParaIA(supabase, empresaId, modulos);
    const highlights = await generarHighlights(resumen);
    const generadoEl = new Date().toISOString();

    await admin.from("highlights").upsert({ empresa_id: empresaId, contenido: highlights, huella: huellaActual, generado_en: generadoEl });
    await admin.from("ia_llamadas").insert({ empresa_id: empresaId });

    return NextResponse.json({ highlights, generadoEl, nuevo: true });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudieron generar los highlights";
    return NextResponse.json({ error: mensaje }, { status: mensaje.includes("GEMINI_API_KEY") ? 503 : 500 });
  }
}
