import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { error, count } = await supabase.from("metas").delete({ count: "exact" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Meta no encontrada" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
