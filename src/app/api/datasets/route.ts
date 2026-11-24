import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { tipoModulo, type TipoModulo } from "@/lib/roles";
import { esStock } from "@/lib/stock";
import type { Columna } from "@/lib/excel-parser";

// Para la app nativa: lista los módulos de la empresa, opcionalmente
// filtrados por tipo (mismo filtro tipoModulo que ya usa
// dashboard/ventas/registrar y dashboard/compras/registrar del lado web).
// "stock" es un caso especial: no es un TipoModulo real (tipoModulo nunca
// devuelve "stock", esStock es un chequeo aparte sobre un módulo "otro").
// "atencion" (Ventanilla, ver VentanillaAtencion.tsx): cualquier módulo con
// un campo "Estado" de lista cerrada Y un contacto real (cliente o
// teléfono) -- por estructura, nunca por el nombre del módulo, así que
// Reservas/Delivery/Alquileres/etc. entran solos y Activos fijos/Hitos de
// proyecto (tienen Estado pero no un cliente real) quedan afuera solos.
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const tipoParam = req.nextUrl.searchParams.get("tipo") as TipoModulo | "stock" | "atencion" | null;

  const { data: datasets, error } = await supabase
    .from("datasets")
    .select("id, nombre, columnas, created_at")
    .eq("empresa_id", sesion.empresaId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filtrados = (datasets ?? []).filter((d) => {
    if (!tipoParam) return true;
    const columnas = d.columnas as Columna[];
    if (tipoParam === "stock") return esStock(columnas);
    if (tipoParam === "atencion") {
      return (
        columnas.some((c) => c.rol === "estado" && (c.opcionesFijas?.length ?? 0) > 0) &&
        columnas.some((c) => c.rol === "cliente" || c.rol === "telefono")
      );
    }
    return tipoModulo(columnas.map((c) => c.rol), d.nombre) === tipoParam;
  });

  return NextResponse.json({
    datasets: filtrados.map((d) => ({ id: d.id, nombre: d.nombre, createdAt: d.created_at })),
  });
}
