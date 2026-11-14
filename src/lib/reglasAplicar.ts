import type { SupabaseClient } from "@supabase/supabase-js";
import type { Columna } from "./excel-parser.ts";
import { ajustarStockDesdeRegistro, revertirStockDesdeRegistro } from "./stock.ts";
import { claveValida } from "./enlaces.ts";
import { normalizarTexto, normalizarTelefonoPE } from "./seguimiento.ts";
import { enviarTexto } from "./whatsapp.ts";
import { enviarPush } from "./push.ts";
import { crearClienteAdmin } from "./supabase/admin.ts";
import { condicionCumple, type Accion, type Evento, type Regla } from "./reglas.ts";

// Lógica de EJECUCIÓN de reglas (servidor, nunca desde un componente cliente
// -- ver el comentario en reglas.ts sobre por qué esto está separado: acá se
// importa firebase-admin (push.ts), que rompe el build si termina en el
// bundle del navegador). Los tipos (Condicion/Accion/Regla) viven en reglas.ts.

// Suma (o resta) `delta` al campo `columnaObjetivoKey` de la fila del dataset
// enlazado cuyo `claveMatch` valga `valorMatch` -- la crea en 0 antes de sumar
// si todavía no existe. Mismo patrón que ajustarStock() en stock.ts, sin
// Kardex (eso es específico del módulo Stock, no de un campo genérico).
async function sumarCampoEnlazado(
  supabase: SupabaseClient,
  datasetObjetivoId: string,
  claveMatch: string,
  valorMatch: string,
  columnaObjetivoKey: string,
  delta: number
): Promise<void> {
  if (!claveValida(claveMatch) || !claveValida(columnaObjetivoKey) || !valorMatch || delta === 0) return;
  const { data: fila } = await supabase
    .from("records")
    .select("id, data")
    .eq("dataset_id", datasetObjetivoId)
    .eq(`data->>${claveMatch}`, valorMatch)
    .maybeSingle();
  if (fila) {
    const actual = Number((fila.data as Record<string, unknown>)[columnaObjetivoKey]) || 0;
    await supabase.from("records").update({ data: { ...(fila.data as object), [columnaObjetivoKey]: actual + delta } }).eq("id", fila.id);
  } else {
    await supabase.from("records").insert({ dataset_id: datasetObjetivoId, data: { [claveMatch]: valorMatch, [columnaObjetivoKey]: delta } });
  }
}

// Magnitud real a sumar: `delta` tal cual si no hay `deltaColumnaKey`, o el
// valor de ESE campo de este registro (ej. la Cantidad real de la venta) si
// lo hay -- mismo piso de 1 que ajustarStockDesdeRegistro en stock.ts si el
// campo no trae un número válido/positivo, para nunca sumar 0 por un dato
// sucio. El SIGNO de `delta` decide la dirección en ambos casos.
function magnitudSumarCampoEnlazado(accion: Extract<Accion, { tipo: "sumar_campo_enlazado" }>, datos: Record<string, unknown>): number {
  const direccion = accion.delta < 0 ? -1 : 1;
  if (!accion.deltaColumnaKey) return accion.delta;
  const cruda = Number(datos[accion.deltaColumnaKey]);
  const magnitud = Number.isFinite(cruda) && cruda > 0 ? cruda : 1;
  return direccion * magnitud;
}

async function dispatchSumarCampoEnlazado(
  supabase: SupabaseClient,
  columnas: Columna[],
  accion: Extract<Accion, { tipo: "sumar_campo_enlazado" }>,
  datos: Record<string, unknown>,
  signo: 1 | -1
): Promise<void> {
  const cEnlace = columnas.find((c) => c.key === accion.columnaEnlaceKey && c.enlace && claveValida(c.enlace.columnaKey));
  if (!cEnlace?.enlace) return;
  const valor = datos[cEnlace.key]?.toString().trim();
  if (!valor) return;
  await sumarCampoEnlazado(supabase, cEnlace.enlace.datasetId, cEnlace.enlace.columnaKey, valor, accion.columnaObjetivoKey, signo * magnitudSumarCampoEnlazado(accion, datos));
}

// Fija (en vez de sumar) el campo objetivo del registro enlazado -- lo crea
// con ese valor si todavía no existe. Idempotente, sin signo/revertir: a
// diferencia de "sumar", no tiene sentido deshacer un valor fijo en una
// edición, solo volver a fijarlo con los datos nuevos (ver el llamador).
async function fijarCampoEnlazado(
  supabase: SupabaseClient,
  datasetObjetivoId: string,
  claveMatch: string,
  valorMatch: string,
  columnaObjetivoKey: string,
  valor: string
): Promise<void> {
  if (!claveValida(claveMatch) || !claveValida(columnaObjetivoKey) || !valorMatch) return;
  const { data: fila } = await supabase
    .from("records")
    .select("id, data")
    .eq("dataset_id", datasetObjetivoId)
    .eq(`data->>${claveMatch}`, valorMatch)
    .maybeSingle();
  if (fila) {
    await supabase.from("records").update({ data: { ...(fila.data as object), [columnaObjetivoKey]: valor } }).eq("id", fila.id);
  } else {
    await supabase.from("records").insert({ dataset_id: datasetObjetivoId, data: { [claveMatch]: valorMatch, [columnaObjetivoKey]: valor } });
  }
}

async function dispatchFijarCampoEnlazado(
  supabase: SupabaseClient,
  columnas: Columna[],
  accion: Extract<Accion, { tipo: "sumar_campo_enlazado" }>,
  datos: Record<string, unknown>
): Promise<void> {
  const cEnlace = columnas.find((c) => c.key === accion.columnaEnlaceKey && c.enlace && claveValida(c.enlace.columnaKey));
  if (!cEnlace?.enlace) return;
  const valorMatch = datos[cEnlace.key]?.toString().trim();
  if (!valorMatch) return;
  await fijarCampoEnlazado(supabase, cEnlace.enlace.datasetId, cEnlace.enlace.columnaKey, valorMatch, accion.columnaObjetivoKey, accion.valor ?? "");
}

// Único punto de entrada que llaman las rutas de /api/records al crear, editar
// o borrar un registro -- reemplaza las llamadas directas a
// ajustarStockDesdeRegistro/revertirStockDesdeRegistro que antes vivían ahí.
// El ajuste de Stock NO se reimplementa acá como una acción genérica
// interpretada: esta función solo DESPACHA a las funciones ya existentes y
// probadas de stock.ts (esa matemática -- qué dataset de Stock, qué columna
// de cantidad, el Kardex -- sigue siendo de ahí, sin tocar).
//
// `datosNuevos`/`datosViejos` siguen el mismo significado que ya tenían en
// stock.ts: solo `datosNuevos` = alta; ambos = edición; solo `datosViejos` =
// eliminación -- de ahí se deriva `evento`, contra el que se filtra
// `regla.evento` (el "Detonante" de la UI). Mutar el registro (excluir de
// reportes, cambiar un campo, eliminarlo) no tiene sentido en una
// eliminación -- no hay fila viva que tocar -- así que esas 2 primeras se
// saltean solas (necesitan `recordId` + `datosNuevos`); los efectos externos
// (WhatsApp, seguimiento, push) sí pueden evaluarse contra los datos viejos.
//
// "Mejor esfuerzo" como el resto de este archivo hermano (stock.ts): quien
// llama debe envolver esto en try/catch, un fallo acá nunca debe tumbar el
// guardado del registro, que ya es lo importante y ya quedó bien guardado --
// y ADEMÁS cada acción externa (WhatsApp, push) tiene su PROPIO try/catch acá
// adentro, para que una falle (ej. WhatsApp fuera de la ventana de 24h) sin
// saltearse las demás reglas del mismo registro.
export async function aplicarReglasDesdeRegistro(
  supabase: SupabaseClient,
  empresaId: string,
  datasetId: string | null,
  recordId: string | null,
  columnas: Columna[],
  reglas: Regla[],
  datosNuevos: Record<string, unknown> | undefined,
  datosViejos: Record<string, unknown> | undefined,
  userId: string | null = null
): Promise<void> {
  let datosFinal: Record<string, unknown> | undefined;
  let huboMutacion = false;
  // Mismo criterio que ya usaba stock.ts para distinguir alta/edición/baja a
  // partir de qué lado viene presente -- ver comentario de `evento` en
  // reglas.ts. `regla.evento` filtra sobre este mismo valor.
  const evento: Evento = datosNuevos && !datosViejos ? "creacion" : datosViejos && datosNuevos ? "modificacion" : "eliminacion";

  for (const regla of reglas) {
    if (!regla.activa) continue;
    if (regla.evento && !regla.evento.includes(evento)) continue;

    if (regla.accion.tipo === "ajustar_stock") {
      if (datosNuevos && !datosViejos) {
        await ajustarStockDesdeRegistro(supabase, empresaId, columnas, datosNuevos, 1, userId);
      } else if (datosViejos) {
        await revertirStockDesdeRegistro(supabase, empresaId, columnas, datosViejos, datosNuevos, userId);
      }
      continue;
    }

    if (regla.accion.tipo === "sumar_campo_enlazado") {
      try {
        if (regla.accion.modo === "fijar") {
          // Idempotente: solo tiene sentido en creación/modificación, con los
          // datos nuevos -- no hay "deshacer" un valor fijo al eliminar.
          if (datosNuevos) await dispatchFijarCampoEnlazado(supabase, columnas, regla.accion, datosNuevos);
        } else if (datosNuevos && !datosViejos) {
          await dispatchSumarCampoEnlazado(supabase, columnas, regla.accion, datosNuevos, 1);
        } else if (datosViejos) {
          await dispatchSumarCampoEnlazado(supabase, columnas, regla.accion, datosViejos, -1);
          if (datosNuevos) await dispatchSumarCampoEnlazado(supabase, columnas, regla.accion, datosNuevos, 1);
        }
      } catch {
        // mejor esfuerzo, ver comentario de arriba
      }
      continue;
    }

    // El resto necesita una fila sobre la que evaluar la condición: los datos
    // nuevos si existen (creación/modificación), o los viejos si el evento es
    // una eliminación (ya no hay fila nueva, pero sí tiene sentido evaluar
    // "qué tenía" para un aviso -- ej. "al eliminar una Reserva, notificar").
    const datosEval = datosNuevos ?? datosViejos;
    if (!datosEval) continue;
    if (!condicionCumple(regla.condicion, datosEval)) continue;

    if (regla.accion.tipo === "eliminar_registro") {
      // Solo tiene sentido en creación/modificación -- ver comentario del tipo en reglas.ts.
      if (recordId && evento !== "eliminacion") {
        try { await supabase.from("records").delete().eq("id", recordId); } catch { /* mejor esfuerzo */ }
      }
    } else if (regla.accion.tipo === "excluir_de_reportes") {
      if (recordId && datosNuevos) {
        if (!datosFinal) datosFinal = { ...datosNuevos };
        datosFinal._excluido_reportes = true;
        huboMutacion = true;
      }
    } else if (regla.accion.tipo === "cambiar_estado") {
      if (recordId && datosNuevos) {
        if (!datosFinal) datosFinal = { ...datosNuevos };
        datosFinal[regla.accion.columnaKey] = regla.accion.valor;
        huboMutacion = true;
      }
    } else if (regla.accion.tipo === "enviar_whatsapp") {
      try {
        const cTelefono = columnas.find((c) => c.rol === "telefono");
        const telefono = cTelefono ? normalizarTelefonoPE(datosEval[cTelefono.key]) : null;
        if (telefono) await enviarTexto(telefono, regla.accion.mensaje);
      } catch {
        // ver comentario de arriba -- ej. fuera de la ventana de 24h de WhatsApp
      }
    } else if (regla.accion.tipo === "agregar_seguimiento") {
      try {
        const cCliente = columnas.find((c) => c.rol === "cliente");
        const nombre = cCliente ? String(datosEval[cCliente.key] ?? "").trim() : "";
        if (nombre && datasetId) {
          const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha");
          const fecha = cFecha ? String(datosEval[cFecha.key] ?? "").slice(0, 10) || null : null;
          await supabase.from("seguimiento_clientes").upsert(
            { empresa_id: empresaId, dataset_id: datasetId, cliente_clave: normalizarTexto(nombre), cliente_nombre: nombre, activo: true, ultima_fecha_cliente: fecha },
            { onConflict: "dataset_id,cliente_clave" }
          );
        }
      } catch {
        // ver comentario de arriba
      }
    } else if (regla.accion.tipo === "notificacion_push") {
      try {
        // push_tokens solo se puede leer con el propio user_id (RLS) -- para
        // avisarle a TODOS los miembros de la empresa (no solo a quien
        // disparó la regla) hace falta el cliente admin, igual que el cron
        // de seguimiento (api/cron/seguimiento-push).
        const admin = crearClienteAdmin();
        const { data: miembros } = await admin.from("miembros").select("user_id").eq("empresa_id", empresaId);
        const userIds = (miembros ?? []).map((m) => m.user_id as string);
        await enviarPush(admin, userIds, regla.accion.titulo, regla.accion.mensaje);
      } catch {
        // ver comentario de arriba -- ej. Firebase mal configurado en el entorno
      }
    }
  }

  if (huboMutacion && recordId && datosFinal) {
    await supabase.from("records").update({ data: datosFinal }).eq("id", recordId);
  }
}
