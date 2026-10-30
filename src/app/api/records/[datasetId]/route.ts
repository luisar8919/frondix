import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";
import { validarEnlaces } from "@/lib/dependientes";
import { claveValida } from "@/lib/enlaces";
import { ajustarStockDesdeRegistro, registrarAjusteManual } from "@/lib/stock";
import { validarCamposRegistro, tipoModulo } from "@/lib/roles";
import type { Columna } from "@/lib/excel-parser";

// Si el valor de una columna de Cliente/Proveedor enlazada no existe todavía en
// la tabla maestra, se crea ahí mismo (en vez de rechazar el registro como con
// cualquier otro enlace): es justo el punto donde se conoce a un cliente o
// proveedor nuevo por primera vez. Lo mismo para Producto cuando lo enlazado
// "parece" un Stock (trae columna "cantidad"): vender o comprar un producto
// nunca antes visto lo da de alta ahí en vez de rechazar el registro. El
// resto de enlaces se quedan estrictos, ahí sí hace falta que el valor ya exista.
async function autoCrearEnlazadosFaltantes(supabase: SupabaseClient, columnas: Columna[], datos: Record<string, unknown>) {
  for (const c of columnas) {
    if (!c.enlace) continue;
    if (c.rol !== "cliente" && c.rol !== "proveedor" && c.rol !== "producto") continue;
    const valor = datos[c.key];
    if (valor === null || valor === undefined || valor === "") continue;
    if (!claveValida(c.enlace.columnaKey)) continue;

    if (c.rol === "producto") {
      const { data: destino } = await supabase.from("datasets").select("columnas").eq("id", c.enlace.datasetId).single();
      if (!(destino?.columnas as Columna[] | undefined)?.some((x) => x.key === "cantidad")) continue; // no es un Stock, se queda estricto
    }

    const { count } = await supabase
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("dataset_id", c.enlace.datasetId)
      .eq(`data->>${c.enlace.columnaKey}`, String(valor));
    if (!count) {
      const datosNuevo: Record<string, unknown> = { [c.enlace.columnaKey]: String(valor) };
      if (c.rol === "producto") datosNuevo.cantidad = 0;
      await supabase.from("records").insert({ dataset_id: c.enlace.datasetId, data: datosNuevo });
    }
  }
}

// RLS ya garantiza que un usuario solo ve/crea records de datasets
// de una empresa donde es miembro — no hace falta chequearlo a mano aquí.

// Supabase corta cada respuesta en 1000 filas: para tablas más grandes hay que
// pedirlas por páginas. Aquí se pide de a `limite` (máx. 1000) y se devuelve el total.
const MAX_PAGINA = 1000;

// Sin sesión, la base niega la ejecución de las funciones de acceso (código 42501):
// eso es "no autenticado", no un error interno del servidor.
function respuestaError(error: { code?: string; message: string }) {
  return error.code === "42501"
    ? NextResponse.json({ error: "No autenticado" }, { status: 401 })
    : NextResponse.json({ error: error.message }, { status: 500 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const supabase = await crearClienteServidor();

  // Un vendedor no ve el contenido de un módulo de Compras (costos, proveedores):
  // su rol es solo registrar ventas y consultar stock. Se chequea en TODAS las
  // páginas (no solo la primera), para que paginar no se salte el bloqueo.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: dsPermiso } = await supabase.from("datasets").select("empresa_id, columnas, nombre").eq("id", datasetId).single();
    if (dsPermiso) {
      const { data: miMembresia } = await supabase.from("miembros").select("rol").eq("empresa_id", dsPermiso.empresa_id).eq("user_id", user.id).single();
      if (miMembresia?.rol === "vendedor" && tipoModulo((dsPermiso.columnas as Columna[]).map((c) => c.rol), dsPermiso.nombre) === "compras") {
        return NextResponse.json({ error: "Tu rol no tiene acceso a este módulo" }, { status: 403 });
      }
    }
  }

  const q = req.nextUrl.searchParams;
  const desde = Math.max(0, parseInt(q.get("desde") ?? "0", 10) || 0);
  const limite = Math.min(MAX_PAGINA, Math.max(1, parseInt(q.get("limite") ?? String(MAX_PAGINA), 10) || MAX_PAGINA));

  // "id" desempata registros creados en el mismo instante (una importación los crea juntos);
  // sin eso, una página podría repetir o saltarse filas.
  const { data: records, count, error } = await supabase
    .from("records")
    .select("id, data, sustento, created_at, updated_at, updated_by", { count: "exact" })
    .eq("dataset_id", datasetId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(desde, desde + limite - 1);
  if (error) return respuestaError(error);

  // La primera página trae además los datos de la tabla y las demás tablas de la empresa
  // (para poder mostrar y editar los enlaces entre tablas).
  if (desde > 0) return NextResponse.json({ records, total: count ?? 0 });

  const { data: datasets, error: errorDatasets } = await supabase
    .from("datasets")
    .select("id, nombre, columnas, incluye_igv, moneda")
    .order("created_at", { ascending: false });
  if (errorDatasets) return respuestaError(errorDatasets);

  const dataset = datasets?.find((d) => d.id === datasetId);
  if (!dataset) return NextResponse.json({ error: "Dataset no encontrado" }, { status: 404 });

  return NextResponse.json({ dataset, otras: datasets.filter((d) => d.id !== datasetId), records, total: count ?? 0 });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  const body = await req.json();

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Si una columna está enlazada a otra tabla, el valor debe existir allí.
  const { data: dataset, error: errorDataset } = await supabase.from("datasets").select("empresa_id, columnas, nombre").eq("id", datasetId).single();
  if (errorDataset?.code === "42501") return respuestaError(errorDataset);
  if (!dataset) return NextResponse.json({ error: "Dataset no encontrado" }, { status: 404 });
  const columnas = dataset.columnas as Columna[];

  if (user && tipoModulo(columnas.map((c) => c.rol), dataset.nombre) === "compras") {
    const { data: miMembresia } = await supabase.from("miembros").select("rol").eq("empresa_id", dataset.empresa_id).eq("user_id", user.id).single();
    if (miMembresia?.rol === "vendedor") return NextResponse.json({ error: "Tu rol no tiene acceso a este módulo" }, { status: 403 });
  }

  const faltaCampo = validarCamposRegistro(columnas, body, dataset.nombre);
  if (faltaCampo) return NextResponse.json({ error: faltaCampo }, { status: 422 });

  // Mejor esfuerzo: si esto falla (ej. un blip de red), no debe tumbar todo el
  // registro -- validarEnlaces de abajo igual va a rechazar con un error claro
  // si de verdad faltó crear algo, en vez de un 500 genérico acá.
  try {
    await autoCrearEnlazadosFaltantes(supabase, columnas, body);
  } catch {
    // sigue abajo
  }

  const fallo = await validarEnlaces(supabase, columnas, body);
  if (fallo) return NextResponse.json({ error: fallo }, { status: 422 });

  const { data, error } = await supabase
    .from("records")
    .insert({ dataset_id: datasetId, data: body, updated_by: user?.email ?? null })
    .select()
    .single();

  if (error) return respuestaError(error);

  // El stock se ajusta "mejor esfuerzo": si algo falla acá, el registro ya
  // quedó bien guardado (lo importante), no vale la pena fallar toda la
  // petición por un ajuste de stock que el usuario puede corregir a mano.
  try {
    await ajustarStockDesdeRegistro(supabase, dataset.empresa_id, columnas, body, 1, user?.id ?? null);
    // Si ESTE módulo es el propio Stock (alta manual de un producto, no vía
    // venta/compra), queda como "ajuste" en el Kardex -- ver registrarAjusteManual.
    await registrarAjusteManual(supabase, dataset.empresa_id, datasetId, columnas, null, body, user?.id ?? null);
  } catch {
    // silencioso a propósito, ver comentario de arriba
  }

  return NextResponse.json({ record: data });
}
