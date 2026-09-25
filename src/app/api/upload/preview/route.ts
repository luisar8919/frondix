import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearExcel } from "@/lib/excel-parser";

// Paso intermedio entre "elegir hoja" y "crear la tabla": muestra las columnas
// detectadas, marcando las sospechosas (ver excel-parser.ts), para que el
// usuario las confirme o renombre antes de que se importe nada.
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const form = await request.formData();
  const archivo = form.get("archivo");
  const hoja = form.get("hoja");

  if (!(archivo instanceof File) || typeof hoja !== "string") {
    return NextResponse.json({ error: "Faltan datos: archivo o hoja" }, { status: 400 });
  }

  try {
    const buffer = await archivo.arrayBuffer();
    const { columnas } = parsearExcel(buffer, hoja);
    return NextResponse.json({ columnas });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo leer el Excel" },
      { status: 422 }
    );
  }
}
