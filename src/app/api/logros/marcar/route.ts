import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { marcarLogro } from "@/lib/logros";

// Solo para los logros que no dejan rastro propio en la base (ver
// MARCABLES_A_MANO en src/lib/logros.ts): "exportaste_reporte" lo llama el
// botón de exportar directo desde el navegador; "whatsapp_enviado" lo llama
// /api/whatsapp/send después de un envío exitoso. marcarLogro ya filtra
// cualquier clave que no esté en esa lista, así que no hace falta validar acá
// cuáles son válidas -- un POST con una clave random simplemente no hace nada.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, clave } = await req.json().catch(() => ({}));
  if (typeof empresaId !== "string" || typeof clave !== "string") {
    return NextResponse.json({ error: "Faltan datos: empresaId, clave" }, { status: 400 });
  }

  await marcarLogro(supabase, empresaId, clave);
  return NextResponse.json({ ok: true });
}
