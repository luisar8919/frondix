import type { SupabaseClient } from "@supabase/supabase-js";

// Inserta los registros de a lotes. NO cambiar a una sola llamada con todas las filas:
// la librería de Supabase arma la lista de columnas con un reduce/concat cuadrático,
// y con ~20.000 filas el servidor se queda pegado minutos sin atender a nadie. Además,
// un lote chico evita el corte por tiempo que Supabase aplica a cada consulta.
export const TAMANO_LOTE = 1000;

// Tope de filas por importación. En pruebas locales 20.000 filas tardaron ~13 s y 50.000 ~29 s;
// se deja en 20.000 porque el servidor en la nube puede cortar peticiones largas (Azure no
// publica ese límite) y porque la pantalla de la tabla muestra hasta 20.000 registros.
export const MAX_FILAS_IMPORTACION = 20000;

export async function insertarRegistros(
  supabase: SupabaseClient,
  datasetId: string,
  filas: Record<string, unknown>[]
): Promise<string | null> {
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    const lote = filas.slice(i, i + TAMANO_LOTE).map((data) => ({ dataset_id: datasetId, data }));
    const { error } = await supabase.from("records").insert(lote);
    if (error) return error.message;
  }
  return null;
}

// Si la importación falla a medias se borra la tabla (los registros se borran en cascada)
// para no dejar una tabla incompleta sin que nadie se entere.
export async function deshacerTabla(supabase: SupabaseClient, datasetId: string): Promise<void> {
  await supabase.from("datasets").delete().eq("id", datasetId);
}
