import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { esStock } from "./stock.ts";
import { tipoModulo } from "./roles.ts";
import type { Columna } from "./excel-parser.ts";

export interface LogroDef {
  clave: string;
  titulo: string;
  descripcion: string;
  // true = solo visible/alcanzable con plan pago (se muestra igual a los del
  // plan gratis, pero bloqueado con el motivo, para que empuje a activar el plan).
  pago: boolean;
}

export interface LogroEstado extends LogroDef {
  logrado: boolean;
  logradoEn: string | null;
}

// Catálogo completo: 20 del plan gratis (uno por cada rincón importante de la
// app, a propósito -- la idea es que revisarlos empuje a probar cada
// funcionalidad) + 6 del plan pago (atadas a las features que ya están
// gateadas por tieneSuscripcionActiva). El orden es el que se muestra.
export const LOGROS: LogroDef[] = [
  { clave: "primer_modulo", titulo: "Primer módulo creado", descripcion: "Creaste tu primera tabla de datos en Frondix.", pago: false },
  { clave: "primer_modulo_manual", titulo: "Módulo sin Excel", descripcion: "Armaste un módulo sin subir ningún archivo.", pago: false },
  { clave: "primera_venta", titulo: "Primera venta", descripcion: "Registraste tu primera venta.", pago: false },
  { clave: "primera_compra", titulo: "Primera compra", descripcion: "Registraste tu primera compra.", pago: false },
  { clave: "primera_orden_compra", titulo: "Primera orden de compra", descripcion: "Creaste tu primera orden de compra a un proveedor.", pago: false },
  { clave: "stock_configurado", titulo: "Alertas de stock activas", descripcion: "Marcaste un stock mínimo para que Frondix te avise.", pago: false },
  { clave: "primer_producto_stock", titulo: "Inventario cargado", descripcion: "Cargaste la cantidad de tu primer producto en Stock.", pago: false },
  { clave: "ajuste_manual_stock", titulo: "Primer ajuste de inventario", descripcion: "Corregiste a mano la cantidad de un producto (conteo o merma).", pago: false },
  { clave: "catalogo_activado", titulo: "Catálogo activado", descripcion: "Activaste tu catálogo público de productos.", pago: false },
  { clave: "primera_nota_cliente", titulo: "Primera nota de cliente", descripcion: "Agregaste una nota a la ficha de un cliente.", pago: false },
  { clave: "primer_prospecto", titulo: "Primer prospecto", descripcion: "Agregaste tu primer prospecto al Pipeline.", pago: false },
  { clave: "primera_recuperacion", titulo: "Primera venta ganada", descripcion: "Avanzaste a un cliente de Prospecto a Cliente en el Pipeline.", pago: false },
  { clave: "seguimiento_activado", titulo: "Seguimiento activo", descripcion: "Activaste el seguimiento de un cliente para no perderlo de vista.", pago: false },
  { clave: "enlace_entre_modulos", titulo: "Módulos enlazados", descripcion: "Enlazaste una columna de un módulo con otro (por ejemplo Ventas con Stock).", pago: false },
  { clave: "moneda_distinta", titulo: "Multi-moneda", descripcion: "Cambiaste la moneda de un módulo.", pago: false },
  { clave: "igv_marcado", titulo: "IGV configurado", descripcion: "Marcaste que un módulo ya incluye IGV.", pago: false },
  { clave: "registro_editado", titulo: "Primera corrección", descripcion: "Editaste un registro que ya habías cargado.", pago: false },
  { clave: "primer_sustento", titulo: "Primer sustento", descripcion: "Adjuntaste el sustento contable (boleta/factura) de un registro.", pago: false },
  { clave: "primera_cxc", titulo: "Primera venta a crédito", descripcion: "Marcaste un saldo pendiente: una venta que todavía te deben.", pago: false },
  { clave: "exportaste_reporte", titulo: "Primer reporte exportado", descripcion: "Exportaste un reporte a PDF o Excel.", pago: false },
  { clave: "ia_sugerencia_excel", titulo: "IA para ordenar un Excel", descripcion: "Usaste la sugerencia por IA para entender un Excel desordenado.", pago: true },
  { clave: "ia_asistente_sin_excel", titulo: "IA sin Excel", descripcion: "Usaste el asistente de IA para armar tablas sin subir ningún archivo.", pago: true },
  { clave: "resumen_ia", titulo: "Resumen con IA", descripcion: "Generaste tu primer resumen con highlights de IA.", pago: true },
  { clave: "whatsapp_enviado", titulo: "WhatsApp enviado", descripcion: "Enviaste tu primer recordatorio automático por WhatsApp.", pago: true },
  { clave: "equipo_invitado", titulo: "Equipo armado", descripcion: "Invitaste a tu primer miembro de equipo.", pago: true },
  { clave: "empresa_adicional", titulo: "Segundo negocio", descripcion: "Creaste una empresa adicional en tu cuenta.", pago: true },
];

const CLAVES_VALIDAS = new Set(LOGROS.map((l) => l.clave));

// Las que no dejan ningún rastro propio en la base (una descarga, un envío que
// no se guarda) se marcan a mano desde donde ocurre la acción, en vez de
// intentar detectarlas escaneando datos -- ver /api/logros/marcar.
const MARCABLES_A_MANO = new Set(["exportaste_reporte", "whatsapp_enviado"]);

interface DatasetLigero {
  id: string;
  nombre: string;
  columnas: Columna[];
  moneda: string | null;
  incluye_igv: boolean | null;
  archivo_original_url: string | null;
}

// "¿Existe algún registro de estos datasets donde la columna de este rol
// cumpla la condición?" -- mismo patrón de leer como texto y comparar en JS
// que ya usa alertasStock.ts, limitado a una muestra razonable: esto es un
// detector de "¿alguna vez pasó?", no necesita mirar cada fila de negocios
// con miles de registros.
async function existeRegistroQueCumpla(
  supabase: SupabaseClient,
  datasetIds: string[],
  columnaKey: string,
  cumple: (valor: string | null) => boolean
): Promise<boolean> {
  if (datasetIds.length === 0 || !claveValida(columnaKey)) return false;
  const { data } = await supabase
    .from("records")
    .select(`v:data->>${columnaKey}`)
    .in("dataset_id", datasetIds)
    .limit(2000);
  return ((data ?? []) as unknown as { v: string | null }[]).some((r) => cumple(r.v));
}

async function datasetsConRecords(supabase: SupabaseClient, datasetIds: string[]): Promise<boolean> {
  if (datasetIds.length === 0) return false;
  const { count } = await supabase.from("records").select("id", { count: "exact", head: true }).in("dataset_id", datasetIds);
  return (count ?? 0) > 0;
}

// Corre, para cada clave TODAVÍA no lograda, el chequeo que le corresponde, y
// devuelve las que ya se cumplen. No marca nada acá -- eso lo hace el llamador
// (revisarYObtenerLogros), para poder guardar logrado_en con la misma fecha
// para todas las que se destraban juntas.
const NO_NECESITAN_DATASETS = new Set([
  "primera_orden_compra", "ajuste_manual_stock", "catalogo_activado", "primera_nota_cliente",
  "primer_prospecto", "primera_recuperacion", "seguimiento_activado", "equipo_invitado",
  "empresa_adicional", "resumen_ia", "ia_sugerencia_excel", "ia_asistente_sin_excel",
]);

async function detectarLogrosCumplidos(supabase: SupabaseClient, empresaId: string, faltantes: Set<string>): Promise<string[]> {
  const detectadas: string[] = [];
  const necesitaDatasets = [...faltantes].some((c) => !NO_NECESITAN_DATASETS.has(c));

  const datasets: DatasetLigero[] = necesitaDatasets
    ? ((await supabase.from("datasets").select("id, nombre, columnas, moneda, incluye_igv, archivo_original_url").eq("empresa_id", empresaId)).data as DatasetLigero[] | null) ?? []
    : [];

  const porTipo = (tipo: "ventas" | "compras") =>
    datasets.filter((d) => tipoModulo((d.columnas as Columna[]).map((c) => c.rol), d.nombre) === tipo).map((d) => d.id);

  for (const clave of faltantes) {
    let cumple = false;
    switch (clave) {
      case "primer_modulo":
        cumple = datasets.length > 0;
        break;
      case "primer_modulo_manual":
        cumple = datasets.some((d) => !d.archivo_original_url);
        break;
      case "primera_venta":
        cumple = await datasetsConRecords(supabase, porTipo("ventas"));
        break;
      case "primera_compra":
        cumple = await datasetsConRecords(supabase, porTipo("compras"));
        break;
      case "primera_orden_compra": {
        const { count } = await supabase.from("ordenes_compra").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId);
        cumple = (count ?? 0) > 0;
        break;
      }
      case "stock_configurado":
        cumple = datasets.some((d) => d.columnas.some((c) => c.rol === "stock_minimo" && claveValida(c.key)));
        break;
      case "primer_producto_stock": {
        const stockIds = datasets.filter((d) => esStock(d.columnas)).map((d) => d.id);
        cumple = await existeRegistroQueCumpla(supabase, stockIds, "cantidad", (v) => Number(v) > 0);
        break;
      }
      case "ajuste_manual_stock": {
        const { count } = await supabase.from("movimientos_stock").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("tipo", "ajuste");
        cumple = (count ?? 0) > 0;
        break;
      }
      case "catalogo_activado": {
        const { data: e } = await supabase.from("empresas").select("catalogo_publico").eq("id", empresaId).single();
        cumple = !!e?.catalogo_publico;
        break;
      }
      case "primera_nota_cliente": {
        const { count } = await supabase.from("notas_cliente").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId);
        cumple = (count ?? 0) > 0;
        break;
      }
      case "primer_prospecto": {
        const { count } = await supabase.from("etapas_cliente").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("manual", true);
        cumple = (count ?? 0) > 0;
        break;
      }
      case "primera_recuperacion": {
        const { count } = await supabase
          .from("etapas_cliente")
          .select("id", { count: "exact", head: true })
          .eq("empresa_id", empresaId)
          .eq("manual", true)
          .neq("etapa", "prospecto");
        cumple = (count ?? 0) > 0;
        break;
      }
      case "seguimiento_activado": {
        const { count } = await supabase.from("seguimiento_clientes").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("activo", true);
        cumple = (count ?? 0) > 0;
        break;
      }
      case "enlace_entre_modulos":
        cumple = datasets.some((d) => d.columnas.some((c) => !!c.enlace));
        break;
      case "moneda_distinta":
        cumple = datasets.some((d) => d.moneda && d.moneda !== "PEN");
        break;
      case "igv_marcado":
        cumple = datasets.some((d) => d.incluye_igv);
        break;
      case "registro_editado": {
        const ids = datasets.map((d) => d.id);
        if (ids.length > 0) {
          const { count } = await supabase.from("records").select("id", { count: "exact", head: true }).in("dataset_id", ids).not("updated_by", "is", null);
          cumple = (count ?? 0) > 0;
        }
        break;
      }
      case "primer_sustento": {
        const ids = datasets.map((d) => d.id);
        if (ids.length > 0) {
          const { count } = await supabase.from("records").select("id", { count: "exact", head: true }).in("dataset_id", ids).not("sustento", "is", null);
          cumple = (count ?? 0) > 0;
        }
        break;
      }
      case "primera_cxc": {
        const dsConSaldo = datasets.filter((d) => d.columnas.some((c) => c.rol === "saldo_pendiente" && claveValida(c.key)));
        for (const d of dsConSaldo) {
          const col = d.columnas.find((c) => c.rol === "saldo_pendiente")!;
          if (await existeRegistroQueCumpla(supabase, [d.id], col.key, (v) => Number(v) > 0)) { cumple = true; break; }
        }
        break;
      }
      case "equipo_invitado": {
        const { count } = await supabase.from("miembros").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId);
        cumple = (count ?? 0) > 1;
        break;
      }
      case "empresa_adicional": {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { count } = await supabase.from("miembros").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("rol", "dueno");
          cumple = (count ?? 0) > 1;
        }
        break;
      }
      case "ia_sugerencia_excel": {
        const { data } = await supabase.from("ia_llamadas").select("documento").eq("empresa_id", empresaId).limit(500);
        cumple = ((data ?? []) as { documento: string }[]).some((r) => !r.documento.startsWith("negocio:"));
        break;
      }
      case "ia_asistente_sin_excel": {
        const { count } = await supabase.from("ia_llamadas").select("id", { count: "exact", head: true }).eq("empresa_id", empresaId).ilike("documento", "negocio:%");
        cumple = (count ?? 0) > 0;
        break;
      }
      case "resumen_ia": {
        const { data: h } = await supabase.from("highlights").select("empresa_id").eq("empresa_id", empresaId).maybeSingle();
        cumple = !!h;
        break;
      }
      // whatsapp_enviado y exportaste_reporte: MARCABLES_A_MANO, no se detectan acá.
    }
    if (cumple) detectadas.push(clave);
  }
  return detectadas;
}

// Punto de entrada único: trae lo ya logrado, detecta lo nuevo, lo guarda, y
// devuelve el catálogo completo con el estado de cada uno. `pagado` filtra
// cuáles de las de plan pago vale la pena ni siquiera intentar detectar (si
// la empresa no tiene plan pago no pueden haberlas cumplido -- evita trabajo).
export async function revisarYObtenerLogros(supabase: SupabaseClient, empresaId: string, pagado: boolean): Promise<LogroEstado[]> {
  const { data: existentes } = await supabase.from("logros").select("clave, logrado_en").eq("empresa_id", empresaId);
  const logradas = new Map<string, string>((existentes ?? []).filter((l) => CLAVES_VALIDAS.has(l.clave)).map((l) => [l.clave, l.logrado_en]));

  const faltantes = new Set(
    LOGROS.filter((l) => !logradas.has(l.clave) && !(l.pago && !pagado) && !MARCABLES_A_MANO.has(l.clave)).map((l) => l.clave)
  );

  if (faltantes.size > 0) {
    const nuevas = await detectarLogrosCumplidos(supabase, empresaId, faltantes);
    if (nuevas.length > 0) {
      const ahora = new Date().toISOString();
      await supabase.from("logros").upsert(
        nuevas.map((clave) => ({ empresa_id: empresaId, clave, logrado_en: ahora })),
        { onConflict: "empresa_id,clave", ignoreDuplicates: true }
      );
      nuevas.forEach((c) => logradas.set(c, ahora));
    }
  }

  return LOGROS.map((l) => ({ ...l, logrado: logradas.has(l.clave), logradoEn: logradas.get(l.clave) ?? null }));
}

// Para las acciones sin rastro propio en la base (ver MARCABLES_A_MANO):
// guarda el logro directo, sin pasar por la detección. Idempotente.
export async function marcarLogro(supabase: SupabaseClient, empresaId: string, clave: string): Promise<void> {
  if (!MARCABLES_A_MANO.has(clave)) return;
  await supabase.from("logros").upsert({ empresa_id: empresaId, clave, logrado_en: new Date().toISOString() }, { onConflict: "empresa_id,clave", ignoreDuplicates: true });
}
