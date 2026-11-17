import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Adjuntar archivos a un registro (foto de boleta, contrato, radiografía,
// plano...) -- bucket privado "adjuntos" en Supabase Storage, creado una vez
// vía API (ver migracion-36-adjuntos.sql). El navegador NUNCA habla con
// Storage directo: todo pasa por acá con el cliente de servicio, que valida
// membresía a mano (mismo criterio que /api/empresas/smtp) -- así no hace
// falta ninguna policy de Storage, solo la tabla de metadatos.
const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB, mismo tope del bucket

async function empresaDelDataset(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, datasetId: string) {
  const { data } = await supabase.from("datasets").select("empresa_id").eq("id", datasetId).single();
  return data?.empresa_id as string | undefined;
}

async function soyMiembro(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, empresaId: string, userId: string) {
  const { data } = await supabase.from("miembros").select("rol").eq("empresa_id", empresaId).eq("user_id", userId).single();
  return !!data;
}

export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const recordId = req.nextUrl.searchParams.get("recordId");
  if (!recordId) return NextResponse.json({ error: "Falta recordId" }, { status: 400 });

  // RLS (ver migración) ya limita esto a adjuntos de empresas donde soy miembro.
  const { data: filas, error } = await supabase
    .from("adjuntos")
    .select("id, nombre_archivo, tipo_mime, tamano_bytes, ruta_storage, subido_por, created_at")
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = crearClienteAdmin();
  const adjuntos = await Promise.all(
    (filas ?? []).map(async (f) => {
      const { data: firmada } = await admin.storage.from("adjuntos").createSignedUrl(f.ruta_storage, 3600);
      return { id: f.id, nombre: f.nombre_archivo, tipo: f.tipo_mime, tamano: f.tamano_bytes, subidoPor: f.subido_por, creadoEn: f.created_at, url: firmada?.signedUrl ?? null };
    })
  );
  return NextResponse.json({ adjuntos });
}

export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { datasetId, recordId, archivo, nombre } = await req.json().catch(() => ({}));
  if (!datasetId || !recordId || !archivo || !nombre) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  const empresaId = await empresaDelDataset(supabase, datasetId);
  if (!empresaId) return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
  if (!(await soyMiembro(supabase, empresaId, user.id))) return NextResponse.json({ error: "No tienes permiso" }, { status: 403 });

  // "archivo" llega como data URL ("data:image/png;base64,....") desde el navegador.
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(archivo));
  if (!match) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 });
  const tipoMime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > LIMITE_BYTES) return NextResponse.json({ error: "El archivo pesa más de 5 MB" }, { status: 413 });

  const nombreSeguro = String(nombre).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const ruta = `${empresaId}/${datasetId}/${recordId}/${crypto.randomUUID()}-${nombreSeguro}`;

  const admin = crearClienteAdmin();
  const { error: errorSubida } = await admin.storage.from("adjuntos").upload(ruta, buffer, { contentType: tipoMime });
  if (errorSubida) return NextResponse.json({ error: errorSubida.message }, { status: 500 });

  const { data: fila, error } = await admin
    .from("adjuntos")
    .insert({ empresa_id: empresaId, dataset_id: datasetId, record_id: recordId, ruta_storage: ruta, nombre_archivo: String(nombre), tipo_mime: tipoMime, tamano_bytes: buffer.length, subido_por: user.email ?? null })
    .select()
    .single();
  if (error) {
    await admin.storage.from("adjuntos").remove([ruta]); // no dejar el archivo huérfano si falla el insert
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: firmada } = await admin.storage.from("adjuntos").createSignedUrl(ruta, 3600);
  return NextResponse.json({ adjunto: { id: fila.id, nombre: fila.nombre_archivo, tipo: fila.tipo_mime, tamano: fila.tamano_bytes, subidoPor: fila.subido_por, creadoEn: fila.created_at, url: firmada?.signedUrl ?? null } });
}
