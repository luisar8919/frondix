import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { limiteModulos } from "@/lib/limites";
import { plantillaVentas, plantillaCompras } from "@/lib/plantillasModulo";

// Crea un módulo vacío a partir de una plantilla (Compras/Ventas), sin pasar
// por subir un Excel -- mismo tope de módulos que /api/upload/auto, y la
// inserción pasa por el cliente de sesión (RLS ya exige ser miembro de la
// empresa, igual que el resto de la app).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { empresaId, tipo, nombre } = await req.json();
  if (!empresaId || !["compras", "ventas"].includes(tipo)) {
    return NextResponse.json({ error: "Faltan datos: empresaId, tipo (compras|ventas)" }, { status: 400 });
  }

  const { actuales, limite } = await limiteModulos(supabase, empresaId);
  if (actuales >= limite) {
    return NextResponse.json(
      { error: `Tu plan permite hasta ${limite} módulos y ya tienes ${actuales}. Borra alguno que no uses, o activa el plan pago para hasta 30.` },
      { status: 422 }
    );
  }

  const columnas = tipo === "compras" ? plantillaCompras() : plantillaVentas();
  const nombreFinal = (typeof nombre === "string" && nombre.trim()) || (tipo === "compras" ? "Compras" : "Ventas");

  const { data: dataset, error } = await supabase
    .from("datasets")
    .insert({ empresa_id: empresaId, nombre: nombreFinal, columnas })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ dataset });
}
