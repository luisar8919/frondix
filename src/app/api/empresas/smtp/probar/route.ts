import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { probarSmtpPropio } from "@/lib/email";
import { descifrar } from "@/lib/cifrado";

// Manda un correo de prueba al correo de la CUENTA que lo pide (no a un
// cliente real) usando el SMTP ya guardado en la base -- así se puede
// confirmar que la configuración sirve antes de activarla de verdad en
// "enviar_correo_cliente".
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId } = await req.json();
  if (!empresaId) return NextResponse.json({ error: "Falta empresaId" }, { status: 400 });
  const { data: miMembresia } = await supabase.from("miembros").select("rol").eq("empresa_id", empresaId).eq("user_id", user.id).single();
  if (!miMembresia || !["dueno", "admin"].includes(miMembresia.rol)) {
    return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
  }

  const { data: empresa } = await supabase
    .from("empresas")
    .select("smtp_host, smtp_port, smtp_usuario, smtp_password_cifrado, smtp_from")
    .eq("id", empresaId)
    .single();
  if (!empresa?.smtp_host || !empresa.smtp_port || !empresa.smtp_usuario || !empresa.smtp_password_cifrado || !empresa.smtp_from) {
    return NextResponse.json({ error: "Completa y guarda todos los datos del SMTP antes de probarlo" }, { status: 400 });
  }

  let password: string;
  try {
    password = descifrar(empresa.smtp_password_cifrado);
  } catch {
    return NextResponse.json({ error: "No se pudo leer la contraseña guardada (vuelve a escribirla y guarda de nuevo)" }, { status: 500 });
  }

  const resultado = await probarSmtpPropio(
    { host: empresa.smtp_host, port: empresa.smtp_port, usuario: empresa.smtp_usuario, password, from: empresa.smtp_from },
    user.email
  );
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 422 });
  return NextResponse.json({ ok: true, enviadoA: user.email });
}
