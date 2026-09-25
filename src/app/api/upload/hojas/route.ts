import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { listarHojas } from "@/lib/excel-parser";

// Paso 1 del flujo de importación: devuelve los nombres de hoja del Excel
// para que el usuario elija cuál importar, sin todavía crear nada en la base.
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const form = await request.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  try {
    const buffer = await archivo.arrayBuffer();
    const hojas = listarHojas(buffer);
    return NextResponse.json({ hojas });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo leer el Excel" },
      { status: 422 }
    );
  }
}
