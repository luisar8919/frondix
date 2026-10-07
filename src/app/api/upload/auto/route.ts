import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";
import { agruparHojas, type Columna, type GrupoHojas } from "@/lib/excel-parser";
import { insertarRegistros, deshacerTabla, MAX_FILAS_IMPORTACION } from "@/lib/insertar";
import { limiteModulos } from "@/lib/limites";
import { tipoModulo } from "@/lib/roles";
import { dividirVentasYCompras, preciosDeCompra, combinarPrecios, completarCostos, cantidadesDeStock, type PrecioCompra } from "@/lib/divisor";

// El asistente de importación ya mostró los grupos (vía /api/upload/grupos) y el
// usuario eligió cuáles quedarse, con nombre y roles ya confirmados/editados. Aquí se
// vuelve a leer el mismo archivo (no se guardó nada entre pasos) y se crea solo eso.
interface SeleccionGrupo {
  incluir: boolean;
  nombre?: string;
  columnas?: { key: string; label: string; rol: string | null }[];
  // Si esta tabla tiene columna de Producto, el usuario pudo pedir que además se
  // cree un módulo "Stock" (Producto + Cantidad) a partir de sus productos.
  crearStock?: boolean;
  // Si esta tabla tiene columna de Tipo de movimiento, el usuario pudo pedir que
  // se divida en Ventas y Compras en vez de un solo módulo mixto.
  dividir?: boolean;
}

// Crea un módulo: completa la fecha si falta (ver abajo), inserta el dataset
// y sus filas. Reusado para el camino normal, cada mitad de un grupo
// dividido, y el módulo Stock.
async function crearModulo(
  supabase: SupabaseClient,
  empresaId: string,
  nombre: string,
  columnasBase: Columna[],
  filasBase: Record<string, unknown>[]
): Promise<{ datasetId: string; nombre: string; filasImportadas: number } | { error: string }> {
  // Los reportes/highlights dependen de tener una fecha (tendencia mensual,
  // "últimos 50 registros"). Si no hay ninguna columna de fecha, se agrega una
  // con la fecha de hoy como referencia en vez de dejarlo sin fecha.
  let columnas = columnasBase;
  let filas = filasBase;
  if (!columnas.some((c) => c.rol === "fecha")) {
    const hoy = new Date().toISOString().slice(0, 10);
    columnas = [...columnas, { key: "fecha_carga", label: "Fecha de carga", tipo: "fecha", rol: "fecha", sospechosa: false }];
    filas = filasBase.map((f) => ({ ...f, fecha_carga: hoy }));
  }

  const { data: dataset, error: errorDataset } = await supabase
    .from("datasets")
    .insert({ empresa_id: empresaId, nombre, columnas })
    .select()
    .single();
  if (errorDataset || !dataset) return { error: errorDataset?.message ?? "No se pudo crear uno de los módulos" };

  const errorInsertar = await insertarRegistros(supabase, dataset.id, filas);
  if (errorInsertar) {
    await deshacerTabla(supabase, dataset.id);
    return { error: `No se pudo importar "${nombre}": ${errorInsertar}` };
  }

  return { datasetId: dataset.id, nombre, filasImportadas: filas.length };
}

// Columnas de un grupo con label/rol ya editados por el usuario -- sin tocar
// key/tipo, que siguen decidiendo lo que ya extrajo el parser.
function columnasEditadas(grupo: GrupoHojas, sel: SeleccionGrupo | undefined): Columna[] {
  return grupo.columnas.map((c) => {
    const edicion = sel?.columnas?.find((e) => e.key === c.key);
    return edicion ? { ...c, label: edicion.label || c.label, rol: (edicion.rol as Columna["rol"]) ?? null } : c;
  });
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

  // Dividir reemplaza 1 módulo por 2 (Ventas + Compras): +1 neto por cada grupo dividido.
  const modulosNuevos =
    gruposAImportar.length +
    gruposAImportar.filter(({ sel }) => sel?.crearStock).length +
    gruposAImportar.filter(({ sel }) => sel?.dividir).length;
  const { actuales: modulosActuales, limite } = await limiteModulos(supabase, empresaId);
  if (modulosActuales + modulosNuevos > limite) {
    return NextResponse.json(
      { error: `Tu plan permite hasta ${limite} módulos y ya tienes ${modulosActuales}. Esto crearía ${modulosNuevos} más. Borra algún módulo que no uses, o activa el plan pago para hasta 30.` },
      { status: 422 }
    );
  }

  // --- Pasada 1: mirar TODO lo que se va a importar junto, antes de crear nada ---
  // Cada grupo se resuelve una sola vez (columnas editadas, si se divide, a qué
  // tipo clasifica) para no repetir ese trabajo entre la pasada de "juntar
  // precios/stock de cualquier pestaña" y la de crear los módulos.
  const avisos: string[] = [];
  const infos = gruposAImportar.map(({ grupo, sel }) => {
    const columnas = columnasEditadas(grupo, sel);
    const cTipo = sel?.dividir ? columnas.find((c) => c.rol === "tipo_movimiento") : undefined;
    const division = cTipo ? dividirVentasYCompras(grupo.filas, cTipo.key) : undefined;
    if (division && division.sinClasificar > 0) {
      const nombre = sel?.nombre?.trim() || grupo.hojas[0];
      avisos.push(`${division.sinClasificar} fila(s) de "${nombre}" no decían claramente si eran venta o compra y se dejaron fuera.`);
    }
    return {
      grupo,
      sel,
      columnas,
      cTipo,
      division,
      tipo: tipoModulo(columnas.map((c) => c.rol)),
      cProducto: columnas.find((c) => c.rol === "producto"),
      cMonto: columnas.find((c) => c.rol === "monto"),
      cFecha: columnas.find((c) => c.rol === "fecha"),
      cCosto: columnas.find((c) => c.rol === "costo"),
      cStock: columnas.find((c) => c.rol === "stock"),
    };
  });

  // Precio de compra más reciente por producto, juntando TODAS las fuentes del
  // archivo: una pestaña entera de Compras, o la mitad de compras de cualquier
  // pestaña dividida -- no solo la que se está procesando en cada momento.
  const mapasPrecios: Map<string, PrecioCompra>[] = [];
  for (const info of infos) {
    if (!info.cProducto || !info.cMonto) continue;
    if (info.division) mapasPrecios.push(preciosDeCompra(info.division.compras, info.cProducto.key, info.cMonto.key, info.cFecha?.key));
    else if (info.tipo === "compras") mapasPrecios.push(preciosDeCompra(info.grupo.filas, info.cProducto.key, info.cMonto.key, info.cFecha?.key));
  }
  const preciosGlobal = combinarPrecios(mapasPrecios);

  // Cantidad de stock por producto, de cualquier pestaña que tenga columna
  // Stock marcada -- independiente de si esa pestaña es de ventas o compras.
  const stockGlobal = new Map<string, number>();
  for (const info of infos) {
    if (!info.cProducto || !info.cStock) continue;
    const filasFuente = info.division ? [...info.division.ventas, ...info.division.compras] : info.grupo.filas;
    for (const [producto, cantidad] of cantidadesDeStock(filasFuente, info.cProducto.key, info.cStock.key)) {
      stockGlobal.set(producto, cantidad);
    }
  }

  // Completa el costo de las ventas (de cualquier pestaña, dividida o no) con
  // los precios de compra juntados arriba -- antes de crear nada, para que el
  // flujo de caja de cada módulo ya salga bien desde la primera vez.
  if (preciosGlobal.size > 0) {
    for (const info of infos) {
      if (!info.cProducto) continue;
      if (info.division) {
        // Si la mitad de ventas no tiene columna de costo, la pasada 2 le agrega
        // una con key "costo" (igual que acá abajo) -- se completa con esa misma key.
        const claveCosto = info.cCosto?.key ?? "costo";
        completarCostos(info.division.ventas, preciosGlobal, info.cProducto.key, claveCosto);
      } else if (info.tipo === "ventas" && info.cCosto) {
        completarCostos(info.grupo.filas, preciosGlobal, info.cProducto.key, info.cCosto.key);
      }
    }
  }

  // --- Pasada 2: crear los módulos con todo ya resuelto ---
  const creados: { datasetId: string; nombre: string; hojas: string[]; filasImportadas: number }[] = [];

  for (const info of infos) {
    const { grupo, sel, columnas, cTipo, division } = info;
    const nombreDataset = sel?.nombre?.trim() || (grupo.hojas.length > 1 ? `${grupo.hojas[0]} y otras` : grupo.hojas[0]);

    if (cTipo && division) {
      // La columna de tipo no viaja a ninguno de los dos módulos: ya quedó
      // implícita en a cuál fue a parar cada fila.
      const sinTipo = columnas.filter((c) => c.key !== cTipo.key);
      let columnasVentas = sinTipo;
      if (!info.cCosto) columnasVentas = [...sinTipo, { key: "costo", label: "Costo", tipo: "numero", rol: "costo", sospechosa: false }];
      // La misma columna de "contraparte" significa Cliente en la mitad de Ventas
      // y Proveedor en la de Compras -- se reasigna el rol, nunca se duplica la columna.
      const columnasCompras = sinTipo.map((c) => (c.rol === "cliente" ? { ...c, rol: "proveedor" as const } : c));

      if (division.ventas.length > 0) {
        const r = await crearModulo(supabase, empresaId, `${nombreDataset} - Ventas`, columnasVentas, division.ventas);
        if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
        creados.push({ ...r, hojas: grupo.hojas });
      }
      if (division.compras.length > 0) {
        const r = await crearModulo(supabase, empresaId, `${nombreDataset} - Compras`, columnasCompras, division.compras);
        if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
        creados.push({ ...r, hojas: grupo.hojas });
      }
      continue;
    }

    const r = await crearModulo(supabase, empresaId, nombreDataset, columnas, grupo.filas);
    if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
    creados.push({ ...r, hojas: grupo.hojas });
    const dataset = { id: r.datasetId };

    // Módulo Stock opcional: Producto (enlazado al producto de este módulo) +
    // Cantidad, una fila por cada producto distinto que aparece en lo que se
    // acaba de importar. Si alguna pestaña del archivo traía una columna Stock
    // real para ese producto, se usa esa cantidad; si no, empieza en 0 y el
    // usuario la corrige a mano después.
    if (sel?.crearStock) {
      const colProducto = columnas.find((c) => c.rol === "producto");
      if (colProducto) {
        const vistos = new Set<string>();
        const productos: string[] = [];
        for (const f of grupo.filas) {
          const texto = f[colProducto.key] === null || f[colProducto.key] === undefined ? "" : String(f[colProducto.key]).trim();
          if (texto && !vistos.has(texto)) {
            vistos.add(texto);
            productos.push(texto);
          }
        }
        if (productos.length > 0) {
          const columnasStock: Columna[] = [
            { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false, enlace: { datasetId: dataset.id, columnaKey: colProducto.key } },
            { key: "cantidad", label: "Cantidad", tipo: "numero", rol: null, sospechosa: false },
          ];
          const { data: datasetStock, error: errorStock } = await supabase
            .from("datasets")
            .insert({ empresa_id: empresaId, nombre: `Stock - ${nombreDataset}`, columnas: columnasStock })
            .select()
            .single();
          if (!errorStock && datasetStock) {
            const filasStock = productos.map((producto) => ({ producto, cantidad: stockGlobal.get(producto) ?? 0 }));
            const errorInsertarStock = await insertarRegistros(supabase, datasetStock.id, filasStock);
            if (!errorInsertarStock) {
              creados.push({ datasetId: datasetStock.id, nombre: datasetStock.nombre, hojas: [], filasImportadas: filasStock.length });
            } else {
              await deshacerTabla(supabase, datasetStock.id);
            }
          }
        }
      }
    }
  }

  return NextResponse.json({ tablas: creados, hojasOmitidas, avisos });
}
