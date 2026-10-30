import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { CATEGORIAS_MODULOS, PLANTILLAS_EXTRA } from "@/lib/plantillasModulo";

// Catálogo de módulos listos para usar más allá de Ventas/Compras (ver
// PLANTILLAS_EXTRA) y sus categorías por tipo de negocio (CATEGORIAS_MODULOS):
// lo consume tanto /dashboard/modulos/nuevo (web) como la app nativa, para no
// duplicar a mano la definición de columnas en Kotlin.
export async function GET() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  return NextResponse.json({
    categorias: CATEGORIAS_MODULOS.map((c) => ({ clave: c.clave, titulo: c.titulo, descripcion: c.descripcion })),
    plantillas: PLANTILLAS_EXTRA.map((p) => ({ clave: p.clave, nombre: p.nombre, descripcion: p.descripcion, categoria: p.categoria, columnas: p.columnas() })),
  });
}
