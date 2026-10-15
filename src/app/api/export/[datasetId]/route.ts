import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import type { Columna } from "@/lib/excel-parser";

const PAGINA = 1000;
const TOPE_FILAS = 20000; // mismo tope que la importación (ver MAX_FILAS_IMPORTACION en insertar.ts)

// Descarga un módulo completo como .xlsx -- una columna por cada columna del
// módulo (con su label, no su key interna), en el mismo orden que se ve en
// pantalla. Para que un contador o cualquier otra herramienta lo pueda abrir
// directo, sin pasar por la app.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { data: dataset, error: errorDataset } = await supabase
    .from("datasets")
    .select("nombre, columnas")
    .eq("id", datasetId)
    .eq("empresa_id", sesion.empresaId) // RLS ya lo filtra, doble chequeo explícito
    .single();
  if (errorDataset || !dataset) return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });

  const columnas = dataset.columnas as Columna[];
  const filas: Record<string, unknown>[] = [];
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data: records, error } = await supabase
      .from("records")
      .select("data")
      .eq("dataset_id", datasetId)
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas.push(...records.map((r) => r.data as Record<string, unknown>));
    if (records.length < PAGINA) break;
  }

  const filasPlanas = filas.map((f) => Object.fromEntries(columnas.map((c) => [c.label, f[c.key] ?? ""])));
  const hoja = XLSX.utils.json_to_sheet(filasPlanas, { header: columnas.map((c) => c.label) });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, dataset.nombre.slice(0, 31) || "Datos"); // Excel no acepta nombres de hoja > 31 chars
  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });

  const nombreArchivo = `${dataset.nombre.replace(/[^a-z0-9]+/gi, "_")}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
