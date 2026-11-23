import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { cambiarEntorno } from "@/lib/factpro";

// Pasa la empresa de demo a producción en FactPro. El dueño del negocio debe
// haber hecho YA el Alta de PSE en su propio SUNAT (ver checklist en la UI) --
// este endpoint no lo verifica, confía en que el usuario lo marcó a conciencia.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  const empresaId = sesion.empresaId;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: miMembresia } = await supabase.from("miembros").select("rol").eq("empresa_id", empresaId).eq("user_id", user!.id).single();
  if (!miMembresia || (miMembresia.rol !== "dueno" && miMembresia.rol !== "admin")) {
    return NextResponse.json({ error: "Solo el dueño o un admin pueden hacer esto" }, { status: 403 });
  }

  const { data: empresa } = await supabase.from("empresas").select("factpro_token").eq("id", empresaId).single();
  if (!empresa?.factpro_token) return NextResponse.json({ error: "Primero activa la facturación electrónica" }, { status: 400 });

  try {
    await cambiarEntorno(empresa.factpro_token, "produccion");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al cambiar de entorno" }, { status: 500 });
  }

  const { error } = await supabase.from("empresas").update({ factpro_entorno: "produccion" }).eq("id", empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
