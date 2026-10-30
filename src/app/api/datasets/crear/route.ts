import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { limiteModulos } from "@/lib/limites";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { plantillaVentas, plantillaCompras, PLANTILLAS_EXTRA } from "@/lib/plantillasModulo";
import type { Columna } from "@/lib/excel-parser";

const CLAVES_PLANTILLA_EXTRA = new Set(PLANTILLAS_EXTRA.map((p) => p.clave));

// Crea uno o varios módulos vacíos sin pasar por subir un Excel -- mismo tope
// de módulos que /api/upload/auto, y la inserción pasa por el cliente de
// sesión (RLS ya exige ser miembro de la empresa, igual que el resto de la
// app). Dos formas de llamarlo:
// - { empresaId, tipo: "compras"|"ventas", nombre? } -- una plantilla fija
//   (botón "+ Registrar compra/venta"). Nunca lleva "plantilla": queda
//   gratis para siempre.
// - { empresaId, modulos: [{ nombre, columnas, plantilla? }] } -- columnas ya
//   armadas, usado tanto por el asistente de IA para negocios sin Excel (sin
//   "plantilla", gratis) como por /dashboard/modulos/nuevo (con "plantilla":
//   la clave del catálogo curado, ver PLANTILLAS_EXTRA -- eso es lo que
//   bloquearDataset usa para saber si el módulo es "adicional").
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, tipo, nombre, modulos } = await req.json();
  if (typeof empresaId !== "string") {
    return NextResponse.json({ error: "Falta empresaId" }, { status: 400 });
  }

  const aCrear: { nombre: string; columnas: Columna[]; plantilla: string | null }[] = Array.isArray(modulos)
    ? modulos
        .filter((m) => m && typeof m.nombre === "string" && m.nombre.trim() && Array.isArray(m.columnas) && m.columnas.length > 0)
        .map((m) => ({
          nombre: String(m.nombre).trim().slice(0, 120),
          columnas: m.columnas as Columna[],
          plantilla: typeof m.plantilla === "string" && CLAVES_PLANTILLA_EXTRA.has(m.plantilla) ? m.plantilla : null,
        }))
    : ["compras", "ventas"].includes(tipo)
      ? [{
          nombre: (typeof nombre === "string" && nombre.trim()) || (tipo === "compras" ? "Compras" : "Ventas"),
          columnas: tipo === "compras" ? plantillaCompras() : plantillaVentas(),
          plantilla: null,
        }]
      : [];

  if (aCrear.length === 0) {
    return NextResponse.json({ error: "Faltan datos: tipo (compras|ventas) o modulos" }, { status: 400 });
  }

  // Los módulos del catálogo curado (PLANTILLAS_EXTRA) son "adicionales": solo
  // se pueden crear con la prueba gratis activa o el plan pago. Ventas/Compras
  // y cualquier módulo sin "plantilla" (Excel, sugerencia por IA) son gratis
  // siempre, no pasan por acá.
  if (aCrear.some((m) => m.plantilla !== null) && !(await tieneSuscripcionActiva(supabase, empresaId))) {
    return NextResponse.json(
      { error: "Este módulo es parte de la prueba gratis o el plan pago. Actívalo para crearlo.", requierePlan: true },
      { status: 402 }
    );
  }

  const { actuales, limite } = await limiteModulos(supabase, empresaId);
  if (actuales + aCrear.length > limite) {
    return NextResponse.json(
      { error: `Tu plan permite hasta ${limite} módulos y ya tienes ${actuales}. Borra alguno que no uses, o activa el plan pago para hasta 30.` },
      { status: 422 }
    );
  }

  const { data: datasets, error } = await supabase
    .from("datasets")
    .insert(aCrear.map((m) => ({ empresa_id: empresaId, nombre: m.nombre, columnas: m.columnas, plantilla: m.plantilla })))
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ dataset: datasets?.[0], datasets });
}
