import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { calcularModulosReporte } from "@/lib/datosReportes";

// Reportes prehechos: para cada módulo con roles marcados, arma solo lo que aplica
// (total por mes si hay Monto+Fecha; top 5 si hay Producto o Cliente). Sin configurar nada.
export async function GET() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: miembro } = await supabase.from("miembros").select("empresa_id").eq("user_id", user.id).limit(1).single();
  if (!miembro) return NextResponse.json({ error: "No tienes una empresa asociada" }, { status: 404 });

  try {
    const modulos = await calcularModulosReporte(supabase, miembro.empresa_id);
    return NextResponse.json({ modulos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron calcular los reportes" }, { status: 500 });
  }
}
