import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";

// Para la app nativa (pantalla "Plan y pagos"): lo mismo que ya lee
// dashboard/billing/page.tsx directo con el cliente browser, pero como
// endpoint -- la app nativa no tiene el SDK de supabase-js.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const planActivo = await tieneSuscripcionActiva(supabase, sesion.empresaId);
  const { data } = await supabase.from("suscripciones").select("prueba_hasta, estado").eq("empresa_id", sesion.empresaId).single();

  return NextResponse.json({
    planActivo,
    pruebaHasta: data?.prueba_hasta ?? null,
    estado: data?.estado ?? "sin_suscripcion",
  });
}
