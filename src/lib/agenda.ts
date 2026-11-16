import type { SupabaseClient } from "@supabase/supabase-js";
import type { Columna } from "./excel-parser";

// Un módulo "de agenda" es cualquiera con la forma de la plantilla Reservas/citas
// (plantillaReservas en plantillasModulo.ts): fecha + una columna "hora" en texto
// + un Estado. Detección estructural, no por `plantilla` -- mismo criterio que
// esStock/tipoModulo: así también reconoce un módulo armado a mano o traído de un
// Excel con esa forma, no solo el creado desde el catálogo.
export function esAgenda(columnas: Columna[]): boolean {
  const cFecha = columnas.find((c) => c.rol === "fecha");
  const cHora = columnas.find((c) => c.key === "hora" && c.tipo === "texto");
  const cEstado = columnas.find((c) => c.rol === "estado");
  return !!cFecha && !!cHora && !!cEstado;
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// true si ese valor de Estado libera el horario (Cancelada/Cancelado/No asistió)
// -- cualquier otro valor (Confirmada, Atendida, o uno que el usuario agregue a
// opcionesFijas) se considera que sigue ocupando el turno.
export function liberaElHorario(valorEstado: unknown): boolean {
  return typeof valorEstado === "string" && /cancel|no asisti/.test(normalizar(valorEstado));
}

function mismoDia(a: unknown, b: unknown): boolean {
  if (!a || !b) return false;
  const da = new Date(String(a));
  const db = new Date(String(b));
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}

// Busca otra fila del mismo módulo con la misma fecha+hora que no esté
// cancelada -- se llama antes de crear/editar una cita (ver /api/records).
// `excluirRecordId` es la propia fila al editarla, para no chocar contra sí misma.
export async function encontrarChoqueAgenda(
  supabase: SupabaseClient,
  datasetId: string,
  columnas: Columna[],
  datos: Record<string, unknown>,
  excluirRecordId?: string
): Promise<string | null> {
  if (!esAgenda(columnas)) return null;
  const cFecha = columnas.find((c) => c.rol === "fecha")!;
  const cEstado = columnas.find((c) => c.rol === "estado")!;
  const fecha = datos[cFecha.key];
  const hora = datos.hora;
  if (!fecha || !hora) return null;

  const { data: registros } = await supabase
    .from("records")
    .select("id, data")
    .eq("dataset_id", datasetId)
    .is("eliminado_en", null);

  const choque = (registros ?? []).find((r) => {
    if (r.id === excluirRecordId) return false;
    if (r.data?.hora !== hora) return false;
    if (!mismoDia(r.data?.[cFecha.key], fecha)) return false;
    return !liberaElHorario(r.data?.[cEstado.key]);
  });
  if (!choque) return null;

  const quien = choque.data?.cliente ?? choque.data?.servicio ?? "otra cita";
  return `Ya hay una cita a las ${String(hora)} ese día (${String(quien)}). Elige otro horario o cambia el estado de esa cita.`;
}
