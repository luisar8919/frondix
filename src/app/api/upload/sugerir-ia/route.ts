import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { agruparHojas } from "@/lib/excel-parser";
import { sugerirEstructuraConIA } from "@/lib/sugerencia-ia";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

// Cada llamada cuesta dinero real en la API de Claude; este tope evita que una
// cuenta (comprometida o por error) genere un gasto grande sin que nadie lo note.
const LIMITE_POR_HORA = 10;

// Re-parsea el mismo archivo (no se guarda nada entre pasos) y le pide a Claude una
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

  const admin = crearClienteAdmin();
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("ia_llamadas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .gte("created_at", haceUnaHora);
  if ((count ?? 0) >= LIMITE_POR_HORA) {
    return NextResponse.json(
      { error: `Ya usaste las ${LIMITE_POR_HORA} sugerencias por IA que permite tu empresa esta hora. Intenta de nuevo más tarde.` },
      { status: 429 }
    );
  }

  let grupos;
  try {
    ({ grupos } = agruparHojas(await archivo.arrayBuffer(), 3));
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
    await admin.from("ia_llamadas").insert({ empresa_id: empresaId }); // solo se cuenta lo que sí costó
    return NextResponse.json({ columnas });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo obtener la sugerencia";
    return NextResponse.json({ error: mensaje }, { status: mensaje.includes("ANTHROPIC_API_KEY") ? 503 : 500 });
  }
}
