import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { limiteModulos } from "@/lib/limites";
import { plantillaVentas, plantillaCompras } from "@/lib/plantillasModulo";
import type { Columna } from "@/lib/excel-parser";

// Crea uno o varios módulos vacíos sin pasar por subir un Excel -- mismo tope
// de módulos que /api/upload/auto, y la inserción pasa por el cliente de
// sesión (RLS ya exige ser miembro de la empresa, igual que el resto de la
// app). Dos formas de llamarlo:
// - { empresaId, tipo: "compras"|"ventas", nombre? } -- una plantilla fija
//   (botón "+ Registrar compra/venta").
// - { empresaId, modulos: [{ nombre, columnas }] } -- columnas ya armadas
//   (el asistente de IA para negocios sin Excel, ver sugerir-ia).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, tipo, nombre, modulos } = await req.json();
  if (typeof empresaId !== "string") {
    return NextResponse.json({ error: "Falta empresaId" }, { status: 400 });
  }

  const aCrear: { nombre: string; columnas: Columna[] }[] = Array.isArray(modulos)
    ? modulos
        .filter((m) => m && typeof m.nombre === "string" && Array.isArray(m.columnas) && m.columnas.length > 0)
        .map((m) => ({ nombre: String(m.nombre).slice(0, 120), columnas: m.columnas as Columna[] }))
    : ["compras", "ventas"].includes(tipo)
      ? [{
          nombre: (typeof nombre === "string" && nombre.trim()) || (tipo === "compras" ? "Compras" : "Ventas"),
          columnas: tipo === "compras" ? plantillaCompras() : plantillaVentas(),
        }]
      : [];

  if (aCrear.length === 0) {
    return NextResponse.json({ error: "Faltan datos: tipo (compras|ventas) o modulos" }, { status: 400 });
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
    .insert(aCrear.map((m) => ({ empresa_id: empresaId, nombre: m.nombre, columnas: m.columnas })))
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ dataset: datasets?.[0], datasets });
}
