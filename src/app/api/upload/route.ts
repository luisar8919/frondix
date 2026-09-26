import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { parsearExcel } from "@/lib/excel-parser";
import { ROLES, type RolColumna } from "@/lib/roles";
import { insertarRegistros, deshacerTabla, MAX_FILAS_IMPORTACION } from "@/lib/insertar";

// Recibe el Excel + nombre del dataset, lo parsea, y crea el dataset
// (definición de columnas) + todos los registros en un solo paso.
export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const form = await request.formData();
  const archivo = form.get("archivo");
  const nombreDataset = form.get("nombre");
  const empresaId = form.get("empresaId");
  const hoja = form.get("hoja");
  const renombresRaw = form.get("renombres"); // JSON opcional: { [key]: nuevoLabel }
  const rolesRaw = form.get("roles"); // JSON opcional: { [key]: rol | null } confirmado por el usuario
  const sinEncabezadoRaw = form.get("sinEncabezado"); // "true" | "false"; ausente = detectarlo solo

  if (
    !(archivo instanceof File) ||
    typeof nombreDataset !== "string" ||
    typeof empresaId !== "string" ||
    typeof hoja !== "string"
  ) {
    return NextResponse.json({ error: "Faltan datos: archivo, nombre, empresaId o hoja" }, { status: 400 });
  }

  let renombres: Record<string, string> | undefined;
  if (typeof renombresRaw === "string" && renombresRaw) {
    try {
      renombres = JSON.parse(renombresRaw);
    } catch {
      return NextResponse.json({ error: "El campo renombres no es JSON válido" }, { status: 400 });
    }
  }

  let parseado;
  try {
    const buffer = await archivo.arrayBuffer();
    parseado = parsearExcel(buffer, hoja, renombres, {
      sinEncabezado: sinEncabezadoRaw === null ? undefined : sinEncabezadoRaw === "true",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo leer el Excel" },
      { status: 422 }
    );
  }

  if (parseado.columnas.length === 0) {
    return NextResponse.json({ error: "No se encontraron columnas con encabezado" }, { status: 422 });
  }

  if (parseado.filas.length > MAX_FILAS_IMPORTACION) {
    return NextResponse.json(
      { error: `La hoja tiene ${parseado.filas.length.toLocaleString("es-PE")} filas y el máximo por importación es ${MAX_FILAS_IMPORTACION.toLocaleString("es-PE")}. Divide el archivo en partes.` },
      { status: 422 }
    );
  }

  if (typeof rolesRaw === "string" && rolesRaw) {
    let roles: Record<string, RolColumna | null>;
    try {
      roles = JSON.parse(rolesRaw);
    } catch {
      return NextResponse.json({ error: "El campo roles no es JSON válido" }, { status: 400 });
    }
    const validos = new Set<string>(ROLES.map((r) => r.valor));
    const usados = Object.values(roles).filter((r): r is RolColumna => r !== null);
    if (usados.some((r) => !validos.has(r))) {
      return NextResponse.json({ error: "Hay un rol de columna inválido" }, { status: 400 });
    }
    if (new Set(usados).size !== usados.length) {
      return NextResponse.json({ error: "Cada rol (monto, fecha, cliente...) solo puede asignarse a una columna" }, { status: 400 });
    }
    parseado.columnas = parseado.columnas.map((c) => (c.key in roles ? { ...c, rol: roles[c.key] } : c));
  }

  const { data: dataset, error: errorDataset } = await supabase
    .from("datasets")
    .insert({ empresa_id: empresaId, nombre: nombreDataset, columnas: parseado.columnas })
    .select()
    .single();

  if (errorDataset || !dataset) {
    return NextResponse.json({ error: errorDataset?.message ?? "No se pudo crear el dataset" }, { status: 500 });
  }

  const errorInsertar = await insertarRegistros(supabase, dataset.id, parseado.filas);
  if (errorInsertar) {
    await deshacerTabla(supabase, dataset.id);
    return NextResponse.json({ error: `No se pudo importar el archivo: ${errorInsertar}` }, { status: 500 });
  }

  return NextResponse.json({
    datasetId: dataset.id,
    columnas: parseado.columnas,
    filasImportadas: parseado.filas.length,
  });
}
