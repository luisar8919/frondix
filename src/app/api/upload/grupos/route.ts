import { NextRequest, NextResponse } from "next/server";
import { agruparHojas } from "@/lib/excel-parser";
import { estructuraConfusa } from "@/lib/roles";

// Vista previa del asistente de importación: agrupa las hojas pero NO crea nada.
// El usuario elige qué módulos quedarse y ajusta nombre/roles antes de confirmar.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  let grupos, hojasOmitidas;
  try {
    const buffer = await archivo.arrayBuffer();
    ({ grupos, hojasOmitidas } = agruparHojas(buffer, 6));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer el Excel" }, { status: 422 });
  }

  return NextResponse.json({
    grupos: grupos.map((g) => ({
      hojas: g.hojas,
      nombreSugerido: g.hojas.length > 1 ? `${g.hojas[0]} y otras` : g.hojas[0],
      // Si no hay columna de fecha, /api/upload/auto agrega una con la fecha de hoy
      // al confirmar: se refleja aquí para que la vista previa de reportes no muestre
      // de menos.
      columnas: g.columnas.some((c) => c.rol === "fecha")
        ? g.columnas
        : [...g.columnas, { key: "fecha_carga", label: "Fecha de carga", tipo: "fecha" as const, rol: "fecha" as const, sospechosa: false }],
      filasCount: g.filas.length,
      filasVaciasDescartadas: g.filasVaciasDescartadas,
      confuso: estructuraConfusa(g.columnas),
      muestra: g.filas.slice(0, 5),
    })),
    hojasOmitidas,
  });
}
