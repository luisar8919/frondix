import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { normalizarTelefonoPE } from "@/lib/seguimiento";

const LIMITE_POR_DIA = 10;
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const MODELO = "gemini-3.5-flash-lite";
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

// Lee un pedido pegado tal cual de WhatsApp y propone los campos de una
// cotización -- mismo motor y mismo patrón de tope/costo que
// /api/datasets/sugerir-ia, solo que acá "documento" es el texto del pedido.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { texto } = await req.json().catch(() => ({}));
  if (typeof texto !== "string" || !texto.trim()) return NextResponse.json({ error: "Falta el texto a leer" }, { status: 400 });

  if (!(await tieneSuscripcionActiva(supabase, sesion.empresaId))) {
    return NextResponse.json({ error: "Leer pedidos con IA es parte del plan pago. Activa tu suscripción para usarlo." }, { status: 402 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Falta configurar GEMINI_API_KEY." }, { status: 503 });

  const admin = crearClienteAdmin();
  const documento = `cotizacion-whatsapp:${texto.trim().slice(0, 180)}`;
  const hace1Dia = new Date(Date.now() - UN_DIA_MS).toISOString();
  const { count } = await admin
    .from("ia_llamadas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", sesion.empresaId)
    .gte("created_at", hace1Dia)
    .like("documento", "cotizacion-whatsapp:%");
  if ((count ?? 0) >= LIMITE_POR_DIA) {
    return NextResponse.json({ error: `Ya usaste las ${LIMITE_POR_DIA} lecturas que permite el plan hoy. Prueba de nuevo mañana.` }, { status: 429 });
  }

  const prompt = `Un pequeño negocio peruano recibió este pedido por WhatsApp y quiere convertirlo en una
cotización. Extrae el nombre del cliente (si lo menciona, si no deja ""), el producto o servicio pedido, el
monto en soles si lo menciona (si no, 0), y el teléfono si aparece un número de celular (si no, "").

Texto del pedido:
"""
${texto.trim().slice(0, 1000)}
"""

Responde ÚNICAMENTE con JSON válido, sin texto antes ni después, con esta forma exacta:
{"cliente":"...","producto":"...","monto":0,"telefono":"..."}`;

  let data: { cliente?: string; producto?: string; monto?: number; telefono?: string } = {};
  try {
    const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 400, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
    const body = await res.json();
    data = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer el texto" }, { status: 502 });
  }

  await admin.from("ia_llamadas").insert({ empresa_id: sesion.empresaId, documento });

  return NextResponse.json({
    cliente: typeof data.cliente === "string" ? data.cliente : "",
    producto: typeof data.producto === "string" ? data.producto : "",
    monto: typeof data.monto === "number" && data.monto > 0 ? data.monto : null,
    telefono: normalizarTelefonoPE(data.telefono) ?? "",
  });
}
