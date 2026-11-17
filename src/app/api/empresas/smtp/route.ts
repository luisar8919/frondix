import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { cifrar } from "@/lib/cifrado";

// SMTP propio de la empresa para "enviar_correo_cliente" (ver lib/email.ts,
// lib/reglasAplicar.ts): el cliente ve el correo venir del dominio/casilla
// real del negocio en vez de avisos@frondix.com. Mismo criterio de permisos
// que /api/empresas/actualizar (solo dueño/admin, escritura con el cliente
// de servicio porque "empresas" no tiene policy de update para el usuario).

async function miRol(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, empresaId: string, userId: string) {
  const { data } = await supabase.from("miembros").select("rol").eq("empresa_id", empresaId).eq("user_id", userId).single();
  return data?.rol ?? null;
}

// Nunca devuelve la contraseña (ni cifrada ni en texto plano) -- la UI solo
// necesita saber si ya hay una guardada para mostrar "•••" en vez de vacío.
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  if (!empresaId) return NextResponse.json({ error: "Falta empresaId" }, { status: 400 });
  if (!["dueno", "admin"].includes(await miRol(supabase, empresaId, user.id) ?? "")) {
    return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("empresas")
    .select("smtp_host, smtp_port, smtp_usuario, smtp_from, smtp_activo, smtp_password_cifrado")
    .eq("id", empresaId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    host: data.smtp_host ?? "",
    port: data.smtp_port ?? 587,
    usuario: data.smtp_usuario ?? "",
    from: data.smtp_from ?? "",
    activo: data.smtp_activo,
    hayPassword: !!data.smtp_password_cifrado,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, host, port, usuario, password, from, activo } = await req.json();
  if (!empresaId) return NextResponse.json({ error: "Falta empresaId" }, { status: 400 });
  if (!["dueno", "admin"].includes(await miRol(supabase, empresaId, user.id) ?? "")) {
    return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });
  }

  if (activo) {
    if (!host || !port || !usuario || !from) {
      return NextResponse.json({ error: "Faltan datos: host, puerto, usuario y remitente son obligatorios" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(from).match(/<(.+)>/)?.[1] ?? from)) {
      return NextResponse.json({ error: "El remitente debe incluir un correo válido, ej: Mi Negocio <correo@midominio.com>" }, { status: 400 });
    }
  }

  const cambios: Record<string, unknown> = {
    smtp_host: host || null,
    smtp_port: port ? Number(port) : null,
    smtp_usuario: usuario || null,
    smtp_from: from || null,
    smtp_activo: !!activo,
  };
  // Campo "password" vacío = "no la cambies" (así no hay que retipearla cada
  // vez que se edita otro dato) -- solo se cifra y guarda si vino con texto.
  if (typeof password === "string" && password.trim()) {
    cambios.smtp_password_cifrado = cifrar(password.trim());
  }

  const admin = crearClienteAdmin();
  const { error } = await admin.from("empresas").update(cambios).eq("id", empresaId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
