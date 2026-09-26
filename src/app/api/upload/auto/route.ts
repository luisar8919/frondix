import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { agruparHojas } from "@/lib/excel-parser";
import { insertarRegistros, deshacerTabla, MAX_FILAS_IMPORTACION } from "@/lib/insertar";

// Alternativa a elegir una hoja a mano: agrupa las hojas del Excel por
// estructura parecida y crea hasta 3 tablas de una, usando en cada grupo
// el esquema de la hoja con más columnas (las demás completan con null).
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const form = await request.formData();
  const archivo = form.get("archivo");
  const empresaId = form.get("empresaId");

  if (!(archivo instanceof File) || typeof empresaId !== "string") {
    return NextResponse.json({ error: "Faltan datos: archivo o empresaId" }, { status: 400 });
  }

  let grupos, hojasOmitidas;
  try {
    const buffer = await archivo.arrayBuffer();
    ({ grupos, hojasOmitidas } = agruparHojas(buffer, 3));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo leer el Excel" },
      { status: 422 }
    );
  }

  if (grupos.length === 0) {
    return NextResponse.json({ error: "No se encontraron hojas con datos para importar" }, { status: 422 });
  }

  const totalFilas = grupos.reduce((suma, g) => suma + g.filas.length, 0);
  if (totalFilas > MAX_FILAS_IMPORTACION) {
    return NextResponse.json(
      { error: `El archivo tiene ${totalFilas.toLocaleString("es-PE")} filas en total y el máximo por importación es ${MAX_FILAS_IMPORTACION.toLocaleString("es-PE")}. Divide el archivo en partes.` },
      { status: 422 }
    );
  }

  const creados: { datasetId: string; nombre: string; hojas: string[]; filasImportadas: number }[] = [];

  for (const grupo of grupos) {
    const nombreDataset = grupo.hojas.length > 1 ? `${grupo.hojas[0]} y otras` : grupo.hojas[0];

    const { data: dataset, error: errorDataset } = await supabase
      .from("datasets")
      .insert({ empresa_id: empresaId, nombre: nombreDataset, columnas: grupo.columnas })
      .select()
      .single();
    if (errorDataset || !dataset) {
      return NextResponse.json(
        { error: errorDataset?.message ?? "No se pudo crear una de las tablas", creadosHastaAhora: creados },
        { status: 500 }
      );
    }

    const errorInsertar = await insertarRegistros(supabase, dataset.id, grupo.filas);
    if (errorInsertar) {
      await deshacerTabla(supabase, dataset.id);
      return NextResponse.json(
        { error: `No se pudo importar "${nombreDataset}": ${errorInsertar}`, creadosHastaAhora: creados },
        { status: 500 }
      );
    }

    creados.push({
      datasetId: dataset.id,
      nombre: nombreDataset,
      hojas: grupo.hojas,
      filasImportadas: grupo.filas.length,
    });
  }

  return NextResponse.json({ tablas: creados, hojasOmitidas });
}
