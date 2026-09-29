import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { agruparHojas, type Columna } from "@/lib/excel-parser";
import { insertarRegistros, deshacerTabla, MAX_FILAS_IMPORTACION } from "@/lib/insertar";

// El asistente de importación ya mostró los grupos (vía /api/upload/grupos) y el
// usuario eligió cuáles quedarse, con nombre y roles ya confirmados/editados. Aquí se
// vuelve a leer el mismo archivo (no se guardó nada entre pasos) y se crea solo eso.
interface SeleccionGrupo {
  incluir: boolean;
  nombre?: string;
  columnas?: { key: string; label: string; rol: string | null }[];
}

export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const form = await request.formData();
  const archivo = form.get("archivo");
  const empresaId = form.get("empresaId");
  const seleccionRaw = form.get("seleccion");

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

  // Sin selección explícita, se mantiene el comportamiento anterior: importar todo.
  let seleccion: (SeleccionGrupo | undefined)[] = grupos.map(() => undefined);
  if (typeof seleccionRaw === "string") {
    try {
      seleccion = JSON.parse(seleccionRaw);
    } catch {
      return NextResponse.json({ error: "El campo seleccion no es JSON válido" }, { status: 400 });
    }
  }

  const gruposAImportar = grupos
    .map((grupo, i) => ({ grupo, sel: seleccion[i] }))
    .filter(({ sel }) => !sel || sel.incluir);

  if (gruposAImportar.length === 0) {
    return NextResponse.json({ error: "No elegiste ningún módulo para crear" }, { status: 422 });
  }

  const totalFilas = gruposAImportar.reduce((suma, { grupo }) => suma + grupo.filas.length, 0);
  if (totalFilas > MAX_FILAS_IMPORTACION) {
    return NextResponse.json(
      { error: `En total son ${totalFilas.toLocaleString("es-PE")} filas y el máximo por importación es ${MAX_FILAS_IMPORTACION.toLocaleString("es-PE")}. Divide el archivo en partes.` },
      { status: 422 }
    );
  }

  const creados: { datasetId: string; nombre: string; hojas: string[]; filasImportadas: number }[] = [];

  for (const { grupo, sel } of gruposAImportar) {
    const nombreDataset = sel?.nombre?.trim() || (grupo.hojas.length > 1 ? `${grupo.hojas[0]} y otras` : grupo.hojas[0]);

    // Solo se toman label/rol de la selección del usuario; key y tipo los sigue
    // decidiendo el parser, para no desalinear los datos ya extraídos del Excel.
    const columnas: Columna[] = grupo.columnas.map((c) => {
      const edicion = sel?.columnas?.find((e) => e.key === c.key);
      return edicion ? { ...c, label: edicion.label || c.label, rol: (edicion.rol as Columna["rol"]) ?? null } : c;
    });

    const { data: dataset, error: errorDataset } = await supabase
      .from("datasets")
      .insert({ empresa_id: empresaId, nombre: nombreDataset, columnas })
      .select()
      .single();
    if (errorDataset || !dataset) {
      return NextResponse.json(
        { error: errorDataset?.message ?? "No se pudo crear uno de los módulos", creadosHastaAhora: creados },
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
