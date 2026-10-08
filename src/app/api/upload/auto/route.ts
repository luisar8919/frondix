import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";
import { agruparHojas, type Columna, type GrupoHojas } from "@/lib/excel-parser";
import { insertarRegistros, deshacerTabla, MAX_FILAS_IMPORTACION } from "@/lib/insertar";
import { limiteModulos } from "@/lib/limites";
import { tipoModulo } from "@/lib/roles";
import {
  dividirVentasYCompras,
  preciosDeCompra,
  combinarPrecios,
  completarCostos,
  cantidadesDeStock,
  separarVentaYCosto,
  valoresDistintos,
  type PrecioCompra,
} from "@/lib/divisor";

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
  // Si esta tabla tiene Monto y Costo en la MISMA fila (sin Tipo), el usuario
  // pudo pedir separarla en Ventas y Compras (ver separarVentaYCosto).
  separar?: boolean;
}

// Crea una tabla maestra (Clientes/Proveedores) con un valor por fila, para
// enlazar la columna de Cliente/Proveedor de Ventas/Compras a algo real en
// vez de texto suelto -- así el registro manual puede elegir de una lista
// (o crear uno nuevo, ver /api/records/[datasetId]). Si falla, no revienta
// la importación: el módulo principal ya quedó bien creado sin esto.
async function crearTablaMaestra(
  supabase: SupabaseClient,
  empresaId: string,
  nombre: string,
  valores: string[]
): Promise<{ datasetId: string; columnaKey: string } | null> {
  if (valores.length === 0) return null;
  const columnas: Columna[] = [{ key: "nombre", label: "Nombre", tipo: "texto", rol: null, sospechosa: false }];
  const { data: dataset, error } = await supabase.from("datasets").insert({ empresa_id: empresaId, nombre, columnas }).select().single();
  if (error || !dataset) return null;
  const errorInsertar = await insertarRegistros(supabase, dataset.id, valores.map((nombre) => ({ nombre })));
  if (errorInsertar) {
    await deshacerTabla(supabase, dataset.id);
    return null;
  }
  return { datasetId: dataset.id, columnaKey: "nombre" };
}

// Crea el módulo Stock opcional (Producto + Cantidad, una fila por producto
// distinto) y lo enlaza SIMÉTRICAMENTE con cada módulo que lo pidió: Stock ->
// primer módulo (para que el formulario de Stock autocomplete con productos ya
// conocidos) y cada módulo -> Stock (para que el registro manual sepa qué
// Stock ajustar solo, ver lib/stock.ts). Reusado por el camino normal, el
// dividido por Tipo y el separado por Monto+Costo -- en los dos últimos, un
// mismo producto puede repetirse en Ventas y Compras, por eso ambos quedan
// enlazados al mismo Stock en vez de crear uno por mitad.
async function crearModuloStockSiPedido(
  supabase: SupabaseClient,
  empresaId: string,
  nombreBase: string,
  productos: string[],
  stockGlobal: Map<string, number>,
  datasetsAEnlazar: { datasetId: string; columnaKey: string }[]
): Promise<{ datasetId: string; nombre: string; filasImportadas: number } | null> {
  if (productos.length === 0 || datasetsAEnlazar.length === 0) return null;

  const primero = datasetsAEnlazar[0];
  const columnasStock: Columna[] = [
    { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false, enlace: { datasetId: primero.datasetId, columnaKey: primero.columnaKey } },
    { key: "cantidad", label: "Cantidad", tipo: "numero", rol: null, sospechosa: false },
  ];
  const { data: datasetStock, error } = await supabase
    .from("datasets")
    .insert({ empresa_id: empresaId, nombre: `Stock - ${nombreBase}`, columnas: columnasStock })
    .select()
    .single();
  if (error || !datasetStock) return null;

  const filas = productos.map((producto) => ({ producto, cantidad: stockGlobal.get(producto) ?? 0 }));
  const errorInsertar = await insertarRegistros(supabase, datasetStock.id, filas);
  if (errorInsertar) {
    await deshacerTabla(supabase, datasetStock.id);
    return null;
  }

  for (const d of datasetsAEnlazar) {
    const { data: ds } = await supabase.from("datasets").select("columnas").eq("id", d.datasetId).single();
    if (ds) {
      const cols = (ds.columnas as Columna[]).map((c) =>
        c.key === d.columnaKey ? { ...c, enlace: { datasetId: datasetStock.id, columnaKey: "producto" } } : c
      );
      await supabase.from("datasets").update({ columnas: cols }).eq("id", d.datasetId);
    }
  }

  return { datasetId: datasetStock.id, nombre: datasetStock.nombre, filasImportadas: filas.length };
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
    ({ grupos, hojasOmitidas } = agruparHojas(buffer, 6));
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

  // Dividir/separar reemplaza 1 módulo por 2 (Ventas + Compras): +1 neto por cada
  // grupo así. Las tablas maestras de Clientes/Proveedores no se cuentan acá (son
  // un extra condicionado a que haya datos, como el módulo Stock antes de esto).
  const modulosNuevos =
    gruposAImportar.length +
    gruposAImportar.filter(({ sel }) => sel?.crearStock).length +
    gruposAImportar.filter(({ sel }) => sel?.dividir).length +
    gruposAImportar.filter(({ sel }) => sel?.separar).length;
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
  const infosBase = gruposAImportar.map(({ grupo, sel }) => {
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
      cCliente: columnas.find((c) => c.rol === "cliente"),
      cProveedor: columnas.find((c) => c.rol === "proveedor"),
      cCantidad: columnas.find((c) => c.rol === "cantidad"),
      cStock: columnas.find((c) => c.rol === "stock"),
    };
  });

  // Precios ya conocidos ANTES de separar nada: una pestaña entera de Compras, o
  // la mitad de compras de cualquier pestaña dividida por Tipo. Sirven para
  // completar el costo que le falte a una fila de "Separar" usando lo que ya se
  // sabe de OTRAS pestañas, además de lo que la propia hoja ya trae.
  const preciosConocidos = combinarPrecios(
    infosBase
      .filter((i) => i.cProducto && i.cMonto && (i.division || i.tipo === "compras"))
      .map((i) =>
        preciosDeCompra(i.division ? i.division!.compras : i.grupo.filas, i.cProducto!.key, i.cMonto!.key, i.cFecha?.key)
      )
  );

  // Cada fila ya trae venta Y costo juntos (sin Tipo que las distinga): se arma
  // una venta y una compra por fila (ver separarVentaYCosto). Para que Compras
  // quede con la MISMA cantidad de filas que Ventas (todo lo vendido se compró
  // alguna vez), antes de separar se completa el costo que falte con el precio
  // de compra más reciente del mismo producto -- de esta misma hoja primero
  // (otro lote del mismo producto que sí trajo costo), y si no, de otra pestaña.
  const infos = infosBase.map((info) => {
    if (!info.sel?.separar || info.cTipo || !info.cMonto || !info.cCosto) return { ...info, separacion: undefined };

    if (info.cProducto) {
      const preciosDeEstaHoja = preciosDeCompra(info.grupo.filas, info.cProducto.key, info.cCosto.key, info.cFecha?.key);
      const combinados = combinarPrecios([preciosConocidos, preciosDeEstaHoja]);
      completarCostos(info.grupo.filas, combinados, info.cProducto.key, info.cCosto.key);
    }

    const separacion = separarVentaYCosto(info.grupo.filas, {
      claveVenta: info.cMonto.key,
      claveCosto: info.cCosto.key,
      claveProducto: info.cProducto?.key,
      claveCliente: info.cCliente?.key,
      claveProveedor: info.cProveedor?.key,
      claveCantidad: info.cCantidad?.key,
      claveFecha: info.cFecha?.key,
    });
    return { ...info, separacion };
  });

  // Precio de compra más reciente por producto, juntando TODAS las fuentes del
  // archivo (ahora incluida la mitad de compras de "Separar") -- para completar
  // el costo de los módulos de Ventas normales más abajo.
  const mapasPrecios: Map<string, PrecioCompra>[] = [preciosConocidos];
  for (const info of infos) {
    if (info.separacion) mapasPrecios.push(preciosDeCompra(info.separacion.compras, "producto", "monto", "fecha"));
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
    const { grupo, sel, columnas, cTipo, division, separacion } = info;
    const nombreDataset = sel?.nombre?.trim() || (grupo.hojas.length > 1 ? `${grupo.hojas[0]} y otras` : grupo.hojas[0]);

    if (separacion) {
      // Columnas fijas: separarVentaYCosto ya normalizó las filas a estas keys
      // (producto/fecha/monto/cliente|proveedor/cantidad), sin importar cómo se
      // llamaban en el Excel original.
      const columnasVentas: Columna[] = [
        ...(info.cFecha ? [{ key: "fecha", label: "Fecha", tipo: "fecha" as const, rol: "fecha" as const, sospechosa: false }] : []),
        ...(info.cProducto ? [{ key: "producto", label: info.cProducto.label, tipo: "texto" as const, rol: "producto" as const, sospechosa: false }] : []),
        // Siempre va, aunque el origen no tuviera columna de Cliente (queda
        // vacía, se llena después a mano o al registrar una venta nueva).
        { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
        { key: "monto", label: info.cMonto?.label ?? "Venta", tipo: "numero", rol: "monto", sospechosa: false },
        { key: "cantidad", label: "Cantidad", tipo: "numero", rol: "cantidad", sospechosa: false },
      ];
      const columnasCompras: Columna[] = [
        ...(info.cFecha ? [{ key: "fecha", label: "Fecha", tipo: "fecha" as const, rol: "fecha" as const, sospechosa: false }] : []),
        ...(info.cProducto ? [{ key: "producto", label: info.cProducto.label, tipo: "texto" as const, rol: "producto" as const, sospechosa: false }] : []),
        // Siempre va, aunque el origen no tuviera proveedor (queda vacía, se
        // llena después a mano): sin esta columna, tipoModulo no tiene cómo
        // distinguir esta tabla de una de Ventas (las dos quedarían con
        // Producto+Monto nomás) y el ajuste de stock sumaría/restaría al revés.
        { key: "proveedor", label: "Proveedor", tipo: "texto", rol: "proveedor", sospechosa: false },
        { key: "monto", label: info.cCosto?.label ?? "Costo", tipo: "numero", rol: "monto", sospechosa: false },
        { key: "cantidad", label: "Cantidad", tipo: "numero", rol: "cantidad", sospechosa: false },
      ];

      let datasetVentasId: string | null = null;
      if (separacion.ventas.length > 0) {
        const r = await crearModulo(supabase, empresaId, `${nombreDataset} - Ventas`, columnasVentas, separacion.ventas);
        if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
        creados.push({ ...r, hojas: grupo.hojas });
        datasetVentasId = r.datasetId;
      }
      let datasetComprasId: string | null = null;
      if (separacion.compras.length > 0) {
        const r = await crearModulo(supabase, empresaId, `${nombreDataset} - Compras`, columnasCompras, separacion.compras);
        if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
        creados.push({ ...r, hojas: grupo.hojas });
        datasetComprasId = r.datasetId;
      }

      // Tablas maestras de Clientes/Proveedores: un nombre por fila distinta
      // encontrada, enlazadas desde la columna de Cliente/Proveedor recién
      // creada -- así el registro manual elige de una lista (o crea uno nuevo
      // al vuelo, ver /api/records/[datasetId]).
      if (datasetVentasId) {
        const clientes = valoresDistintos(separacion.ventas, "cliente");
        const maestro = await crearTablaMaestra(supabase, empresaId, `Clientes - ${nombreDataset}`, clientes);
        if (maestro) {
          const { data: ds } = await supabase.from("datasets").select("columnas").eq("id", datasetVentasId).single();
          if (ds) {
            const cols = (ds.columnas as Columna[]).map((c) => (c.key === "cliente" ? { ...c, enlace: maestro } : c));
            await supabase.from("datasets").update({ columnas: cols }).eq("id", datasetVentasId);
          }
          creados.push({ datasetId: maestro.datasetId, nombre: `Clientes - ${nombreDataset}`, hojas: [], filasImportadas: clientes.length });
        }
      }
      if (datasetComprasId && info.cProveedor) {
        const proveedores = valoresDistintos(separacion.compras, "proveedor");
        const maestro = await crearTablaMaestra(supabase, empresaId, `Proveedores - ${nombreDataset}`, proveedores);
        if (maestro) {
          const { data: ds } = await supabase.from("datasets").select("columnas").eq("id", datasetComprasId).single();
          if (ds) {
            const cols = (ds.columnas as Columna[]).map((c) => (c.key === "proveedor" ? { ...c, enlace: maestro } : c));
            await supabase.from("datasets").update({ columnas: cols }).eq("id", datasetComprasId);
          }
          creados.push({ datasetId: maestro.datasetId, nombre: `Proveedores - ${nombreDataset}`, hojas: [], filasImportadas: proveedores.length });
        }
      }

      if (sel?.crearStock && info.cProducto) {
        const productos = valoresDistintos([...separacion.ventas, ...separacion.compras], "producto");
        const enlazar = [
          ...(datasetVentasId ? [{ datasetId: datasetVentasId, columnaKey: "producto" }] : []),
          ...(datasetComprasId ? [{ datasetId: datasetComprasId, columnaKey: "producto" }] : []),
        ];
        const r = await crearModuloStockSiPedido(supabase, empresaId, nombreDataset, productos, stockGlobal, enlazar);
        if (r) creados.push({ ...r, hojas: [] });
      }
      continue;
    }

    if (cTipo && division) {
      // La columna de tipo no viaja a ninguno de los dos módulos: ya quedó
      // implícita en a cuál fue a parar cada fila.
      const sinTipo = columnas.filter((c) => c.key !== cTipo.key);
      let columnasVentas = sinTipo;
      if (!info.cCosto) columnasVentas = [...columnasVentas, { key: "costo", label: "Costo", tipo: "numero", rol: "costo", sospechosa: false }];
      // Siempre va una columna de Cliente en Ventas, aunque el origen no la
      // tuviera (queda vacía, se llena después a mano o al registrar una venta).
      if (!columnasVentas.some((c) => c.rol === "cliente")) {
        columnasVentas = [...columnasVentas, { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false }];
      }
      // La misma columna de "contraparte" significa Cliente en la mitad de Ventas
      // y Proveedor en la de Compras -- se reasigna el rol, nunca se duplica la columna.
      let columnasCompras = sinTipo.map((c) => (c.rol === "cliente" ? { ...c, rol: "proveedor" as const } : c));
      // Si el origen no tenía columna de contraparte, Compras y Ventas quedarían
      // con los mismos roles (Producto+Monto) y tipoModulo no podría distinguirlas
      // -- se agrega una Proveedor vacía solo para que la clasificación (y el
      // ajuste de stock, que depende de ella) no se confundan.
      if (!columnasCompras.some((c) => c.rol === "proveedor")) {
        columnasCompras = [...columnasCompras, { key: "proveedor", label: "Proveedor", tipo: "texto", rol: "proveedor", sospechosa: false }];
      }

      let datasetVentasId: string | null = null;
      if (division.ventas.length > 0) {
        const r = await crearModulo(supabase, empresaId, `${nombreDataset} - Ventas`, columnasVentas, division.ventas);
        if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
        creados.push({ ...r, hojas: grupo.hojas });
        datasetVentasId = r.datasetId;
      }
      let datasetComprasId: string | null = null;
      if (division.compras.length > 0) {
        const r = await crearModulo(supabase, empresaId, `${nombreDataset} - Compras`, columnasCompras, division.compras);
        if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
        creados.push({ ...r, hojas: grupo.hojas });
        datasetComprasId = r.datasetId;
      }

      if (sel?.crearStock && info.cProducto) {
        const claveProducto = info.cProducto.key;
        const productos = valoresDistintos([...division.ventas, ...division.compras], claveProducto);
        const enlazar = [
          ...(datasetVentasId ? [{ datasetId: datasetVentasId, columnaKey: claveProducto }] : []),
          ...(datasetComprasId ? [{ datasetId: datasetComprasId, columnaKey: claveProducto }] : []),
        ];
        const r = await crearModuloStockSiPedido(supabase, empresaId, nombreDataset, productos, stockGlobal, enlazar);
        if (r) creados.push({ ...r, hojas: [] });
      }
      continue;
    }

    // Toda tabla de Ventas lleva columna de Cliente, aunque el origen no la
    // tuviera (queda vacía, se llena después a mano o al registrar una venta).
    const columnasFinal =
      info.tipo === "ventas" && !columnas.some((c) => c.rol === "cliente")
        ? [...columnas, { key: "cliente", label: "Cliente", tipo: "texto" as const, rol: "cliente" as const, sospechosa: false }]
        : columnas;

    const r = await crearModulo(supabase, empresaId, nombreDataset, columnasFinal, grupo.filas);
    if ("error" in r) return NextResponse.json({ error: r.error, creadosHastaAhora: creados }, { status: 500 });
    creados.push({ ...r, hojas: grupo.hojas });

    // Módulo Stock opcional: Producto (enlazado al producto de este módulo) +
    // Cantidad, una fila por cada producto distinto que aparece en lo que se
    // acaba de importar. Si alguna pestaña del archivo traía una columna Stock
    // real para ese producto, se usa esa cantidad; si no, empieza en 0 y el
    // usuario la corrige a mano después.
    if (sel?.crearStock && info.cProducto) {
      const claveProducto = info.cProducto.key;
      const productos = valoresDistintos(grupo.filas, claveProducto);
      const stock = await crearModuloStockSiPedido(supabase, empresaId, nombreDataset, productos, stockGlobal, [
        { datasetId: r.datasetId, columnaKey: claveProducto },
      ]);
      if (stock) creados.push({ ...stock, hojas: [] });
    }
  }

  return NextResponse.json({ tablas: creados, hojasOmitidas, avisos });
}
