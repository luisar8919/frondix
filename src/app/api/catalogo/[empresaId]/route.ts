import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { productosCatalogo } from "@/lib/catalogo";

// Público, sin sesión: cualquiera con el link puede ver esto. Por eso exige
// catalogo_publico=true (apagado por defecto, ver /api/catalogo/toggle) y usa
// el cliente de servicio solo para LEER, nunca para escribir.
export async function GET(_req: Request, { params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const admin = crearClienteAdmin();

  const { data: empresa, error } = await admin.from("empresas").select("nombre, telefono, catalogo_publico").eq("id", empresaId).single();
  if (error || !empresa) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!empresa.catalogo_publico) return NextResponse.json({ error: "Este negocio no tiene un catálogo público" }, { status: 404 });

  try {
    const productos = await productosCatalogo(admin, empresaId);
    return NextResponse.json({ nombre: empresa.nombre, telefono: empresa.telefono, productos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cargar el catálogo" }, { status: 500 });
  }
}
