import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida, relacionesEntrantes, type DatasetResumen } from "./enlaces.ts";
import type { Columna } from "./excel-parser.ts";

// Solo servidor. Si una columna está enlazada a otra tabla, el valor debe existir allí.
// Devuelve el mensaje de error, o null si todo está bien.
export async function validarEnlaces(supabase: SupabaseClient, columnas: Columna[], datos: Record<string, unknown>) {
  for (const c of columnas) {
    if (!c.enlace) continue;
    const valor = datos[c.key];
    if (valor === null || valor === undefined || valor === "") continue;
    if (!claveValida(c.enlace.columnaKey)) continue;

    const { count } = await supabase
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("dataset_id", c.enlace.datasetId)
      .eq(`data->>${c.enlace.columnaKey}`, String(valor));

    if (!count) return `"${valor}" no existe en la tabla enlazada a "${c.label}". Agrégalo primero en esa tabla.`;
  }
  return null;
}

// Al cambiar o borrar un registro: qué registros de OTRAS tablas dependen de sus valores.
// Si otro registro de esta misma tabla conserva el mismo valor, nadie queda huérfano.
// `nuevo` = null cuando se elimina.
export async function advertenciasDeRegistro(
  supabase: SupabaseClient,
  datasetId: string,
  recordId: string,
  anterior: Record<string, unknown>,
  nuevo: Record<string, unknown> | null
): Promise<string[]> {
  const { data: todas } = await supabase.from("datasets").select("id, nombre, columnas");
  const otras = (todas ?? []).filter((d) => d.id !== datasetId) as DatasetResumen[];
  const avisos: string[] = [];

  for (const rel of relacionesEntrantes(otras, datasetId)) {
    if (!claveValida(rel.miColumnaKey) || !claveValida(rel.columnaKey)) continue;
    const valor = anterior[rel.miColumnaKey];
    if (valor === null || valor === undefined || valor === "") continue;
    if (nuevo && String(nuevo[rel.miColumnaKey] ?? "") === String(valor)) continue;

    const { count: iguales } = await supabase
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("dataset_id", datasetId)
      .neq("id", recordId)
      .eq(`data->>${rel.miColumnaKey}`, String(valor));
    if (iguales) continue;

    const { count } = await supabase
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("dataset_id", rel.datasetId)
      .eq(`data->>${rel.columnaKey}`, String(valor));
    if (!count) continue;

    avisos.push(
      `"${valor}" está enlazado desde ${count} ${count === 1 ? "registro" : "registros"} de la tabla "${rel.nombre}". ` +
        `Si lo ${nuevo ? "cambias" : "eliminas"}, ${count === 1 ? "ese registro quedará" : "esos registros quedarán"} apuntando a un valor que ya no existe.`
    );
  }
  return avisos;
}
