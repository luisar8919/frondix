import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";
import { agruparHojas, type Columna } from "@/lib/excel-parser";
import { insertarRegistros, deshacerTabla, MAX_FILAS_IMPORTACION } from "@/lib/insertar";
import { limiteModulos } from "@/lib/limites";
import { dividirVentasYCompras } from "@/lib/divisor";

// El asistente de importación ya mostró los grupos (vía /api/upload/grupos) y el
// usuario eligió cuáles quedarse, con nombre y roles ya confirmados/editados. Aquí se
// vuelve a leer el mismo archivo (no se guardó nada entre pasos) y se crea solo eso.
interface SeleccionGrupo {
  incluir: boolean;
  nombre?: string;
  columnas?: { key: string; label: string; rol: string | null }[];
  // Si esta tabla tiene columna de Producto, el usuario pudo pedir que además se
  // cree un módulo "Stock" (Producto + Cantidad en 0) a partir de sus productos.
  crearStock?: boolean;
  // Si esta tabla tiene columna de Tipo de movimiento, el usuario pudo pedir que
  // se divida en Ventas y Compras en vez de un solo módulo mixto.
  dividir?: boolean;
}

// Crea un módulo: completa la fecha si falta (igual que antes, ver abajo),
// inserta el dataset y sus filas. Reusado tanto para el camino normal como
// para cada mitad de un grupo dividido en Ventas/Compras.
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

  const creados: { datasetId: string; nombre: string; hojas: string[]; filasImportadas: number }[] = [];
  const avisos: string[] = [];

  for (const { grupo, sel } of gruposAImportar) {
    const nombreDataset = sel?.nombre?.trim() || (grupo.hojas.length > 1 ? `${grupo.hojas[0]} y otras` : grupo.hojas[0]);

    // Solo se toman label/rol de la selección del usuario; key y tipo los sigue
    // decidiendo el parser, para no desalinear los datos ya extraídos del Excel.
    const columnas: Columna[] = grupo.columnas.map((c) => {
      const edicion = sel?.columnas?.find((e) => e.key === c.key);
      return edicion ? { ...c, label: edicion.label || c.label, rol: (edicion.rol as Columna["rol"]) ?? null } : c;
    });

    const cTipo = sel?.dividir ? columnas.find((c) => c.rol === "tipo_movimiento") : undefined;

    if (cTipo) {
      // Divide las filas en Ventas/Compras según esa columna, y completa el costo
      // de cada venta con el monto de compra más reciente del mismo producto (ver
      // lib/divisor.ts). La columna de tipo no viaja a ninguno de los dos módulos:
      // ya quedó implícita en a cuál fue a parar cada fila.
      const cProducto = columnas.find((c) => c.rol === "producto");
      const cMonto = columnas.find((c) => c.rol === "monto");
      const cFecha = columnas.find((c) => c.rol === "fecha");
      let cCosto = columnas.find((c) => c.rol === "costo");

      const sinTipo = columnas.filter((c) => c.key !== cTipo.key);
      let columnasVentas = sinTipo;
      if (!cCosto) {
        cCosto = { key: "costo", label: "Costo", tipo: "numero", rol: "costo", sospechosa: false };
        columnasVentas = [...sinTipo, cCosto];
      }
      // La misma columna de "contraparte" significa Cliente en la mitad de Ventas
      // y Proveedor en la de Compras -- se reasigna el rol, nunca se duplica la columna.
      const columnasCompras = sinTipo.map((c) => (c.rol === "cliente" ? { ...c, rol: "proveedor" as const } : c));

      const { ventas, compras, sinClasificar } = dividirVentasYCompras(grupo.filas, cTipo.key, {
        claveProducto: cProducto?.key,
        claveMonto: cMonto?.key,
        claveFecha: cFecha?.key,
        claveCosto: cCosto.key,
      });

      if (ventas.length > 0) {
        const r = await crearModulo(supabase, empresaId, `${nombreDataset} - Ventas`, columnasVentas, ventas);
        if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
        creados.push({ ...r, hojas: grupo.hojas });
      }
      if (compras.length > 0) {
        const r = await crearModulo(supabase, empresaId, `${nombreDataset} - Compras`, columnasCompras, compras);
        if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
        creados.push({ ...r, hojas: grupo.hojas });
      }
      if (sinClasificar > 0) {
        avisos.push(`${sinClasificar} fila(s) de "${nombreDataset}" no decían claramente si eran venta o compra y se dejaron fuera.`);
      }
      continue;
    }

    const r = await crearModulo(supabase, empresaId, nombreDataset, columnas, grupo.filas);
    if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
    creados.push({ ...r, hojas: grupo.hojas });
    const dataset = { id: r.datasetId };

    // Módulo Stock opcional: Producto (enlazado al producto de este módulo) + Cantidad
    // en 0, una fila por cada producto distinto que aparece en lo que se acaba de
    // importar. El usuario edita las cantidades a mano después -- esto solo arma el
    // punto de partida. Si algo falla acá no se revierte el módulo principal, que ya
    // quedó bien creado.
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
            const filasStock = productos.map((producto) => ({ producto, cantidad: 0 }));
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
