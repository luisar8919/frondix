import type { SupabaseClient } from "@supabase/supabase-js";
import { claveValida } from "./enlaces.ts";
import { tipoModulo } from "./roles.ts";
import type { Columna } from "./excel-parser.ts";

export type TipoMovimientoStock = "venta" | "compra" | "ajuste";

// Solo servidor. El módulo Stock que alimenta este dataset de Ventas/Compras:
// su PROPIA columna de Producto está enlazada (enlace) al dataset de Stock
// (aparte del enlace al revés que ya tenía Stock -> Ventas, para el
// autocompletado de su propio formulario -- son dos columnas distintas, no
// se pisan). Así Ventas Y Compras pueden compartir el mismo Stock cada una
// con su propio enlace, en vez de que Stock solo pueda "mirar" hacia un lado.
export async function datasetStockDe(
  supabase: SupabaseClient,
  empresaId: string,
  columnas: Columna[]
): Promise<{ id: string; claveProducto: string } | null> {
  const cProducto = columnas.find((c) => c.rol === "producto" && c.enlace && claveValida(c.enlace.columnaKey));
  if (!cProducto?.enlace) return null;

  const { data: stockDataset } = await supabase
    .from("datasets")
    .select("id, columnas")
    .eq("id", cProducto.enlace.datasetId)
    .eq("empresa_id", empresaId)
    .single();
  if (!stockDataset) return null;
  if (!(stockDataset.columnas as Columna[]).some((c) => c.key === "cantidad")) return null; // no "parece" un stock

  return { id: stockDataset.id, claveProducto: cProducto.enlace.columnaKey };
}

// Un dataset "parece" un Stock si trae columna "cantidad" (clave fija) y una
// columna de rol Producto -- Y además NO clasifica como Ventas o Compras.
// Ese último chequeo es necesario: un módulo de Ventas o Compras casi siempre
// tiene SU PROPIA columna de cantidad (cuántas unidades se vendieron/compraron
// en esa fila, rol "cantidad"), que por el mismo patrón de armar keys termina
// con key "cantidad" -- sin este chequeo, cualquier Venta/Compra con esa
// columna se confundía con un módulo de Stock real (bug visto en vivo:
// "Compras" aparecía en Valorización de inventario con un monto inventado).
export function esStock(columnas: Columna[]): boolean {
  const tipo = tipoModulo(columnas.map((c) => c.rol));
  return tipo === "otro" && columnas.some((c) => c.key === "cantidad") && columnas.some((c) => c.rol === "producto");
}

// Un dataset "parece" un Menú (restaurante: platos Y bebidas que se venden al
// cliente final, ver CLAUDE.md de la sesión que pidió esto) si trae Producto +
// una columna de rol "composicion" -- a diferencia de Stock, un Menú NO lleva
// su propia "cantidad" (no se cuenta inventario de un plato, se arma al
// vender). Nunca rol "monto" (eso lo haría clasificar como Ventas, ver
// tipoModulo): el precio de un ítem del Menú usa el rol "precio" en su lugar.
export function esMenu(columnas: Columna[]): boolean {
  return columnas.some((c) => c.rol === "producto") && columnas.some((c) => c.rol === "composicion");
}

// Mismo mecanismo que datasetStockDe, pero para cuando el Producto de Ventas
// enlaza a un Menú en vez de a un Stock directo -- ver ajustarStockDesdeRegistro.
export async function datasetMenuDe(
  supabase: SupabaseClient,
  empresaId: string,
  columnas: Columna[]
): Promise<{ id: string; claveProducto: string; claveComposicion: string } | null> {
  const cProducto = columnas.find((c) => c.rol === "producto" && c.enlace && claveValida(c.enlace.columnaKey));
  if (!cProducto?.enlace) return null;

  const { data: menuDataset } = await supabase
    .from("datasets")
    .select("id, columnas")
    .eq("id", cProducto.enlace.datasetId)
    .eq("empresa_id", empresaId)
    .single();
  const menuColumnas = (menuDataset?.columnas ?? []) as Columna[];
  if (!menuDataset || !esMenu(menuColumnas)) return null;
  const cComposicion = menuColumnas.find((c) => c.rol === "composicion");
  if (!cComposicion) return null;

  return { id: menuDataset.id, claveProducto: cProducto.enlace.columnaKey, claveComposicion: cComposicion.key };
}

// "Carne:0.2, Papa:0.3, Cebolla:0.1" -> [{nombre:"Carne",cantidad:0.2}, ...].
// Entradas sin ":" o con cantidad no numérica/≤0 se descartan en silencio
// (mejor esfuerzo). Vive acá (no en reglasAplicar.ts, que la tenía antes) para
// que tanto la acción "descontar_insumos" como la composición de un ítem del
// Menú (ver dispatchDescontarInsumosMenu de abajo) compartan el mismo parser,
// sin que stock.ts tenga que importar de reglasAplicar.ts (que a su vez
// importa de acá -- sería circular).
export function parsearReceta(texto: string): { nombre: string; cantidad: number }[] {
  return texto
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [nombre, cant] = p.split(":").map((s) => s.trim());
      return { nombre: nombre ?? "", cantidad: Number(cant) };
    })
    .filter((i) => i.nombre && Number.isFinite(i.cantidad) && i.cantidad > 0);
}

// Deja registro del movimiento en el Kardex (movimientos_stock) -- "mejor
// esfuerzo" como el resto de este archivo: si la tabla no existe todavía
// (falta correr la migración 16) o falla por lo que sea, no debe tumbar el
// ajuste de stock que ya se aplicó.
async function registrarMovimiento(
  supabase: SupabaseClient,
  empresaId: string,
  datasetId: string,
  producto: string,
  tipo: TipoMovimientoStock,
  delta: number,
  saldo: number,
  userId: string | null,
  motivo?: string | null
): Promise<void> {
  if (delta === 0) return;
  try {
    await supabase.from("movimientos_stock").insert({
      empresa_id: empresaId,
      dataset_id: datasetId,
      producto,
      tipo,
      cantidad: delta,
      saldo,
      motivo: motivo ?? null,
      created_by: userId,
    });
  } catch {
    // silencioso a propósito, ver comentario de arriba
  }
}

// Suma (o resta) `delta` a la cantidad de un producto en el dataset de Stock.
// Si el producto todavía no tiene fila ahí, la crea empezando en 0 antes de
// ajustar -- así un producto nuevo que se compra o vende por primera vez
// también queda reflejado, sin que el usuario tenga que crearlo a mano.
export async function ajustarStock(
  supabase: SupabaseClient,
  stockDatasetId: string,
  claveProducto: string,
  producto: string,
  delta: number,
  registro: { empresaId: string; tipo: TipoMovimientoStock; userId: string | null; motivo?: string | null }
): Promise<void> {
  if (!claveValida(claveProducto) || !producto || delta === 0) return;

  const { data: fila } = await supabase
    .from("records")
    .select("id, data")
    .eq("dataset_id", stockDatasetId)
    .eq(`data->>${claveProducto}`, producto)
    .maybeSingle();

  let saldo: number;
  if (fila) {
    const actual = Number((fila.data as Record<string, unknown>).cantidad) || 0;
    saldo = actual + delta;
    await supabase.from("records").update({ data: { ...(fila.data as object), cantidad: saldo } }).eq("id", fila.id);
  } else {
    saldo = delta;
    await supabase.from("records").insert({ dataset_id: stockDatasetId, data: { [claveProducto]: producto, cantidad: delta } });
  }

  await registrarMovimiento(supabase, registro.empresaId, stockDatasetId, producto, registro.tipo, delta, saldo, registro.userId, registro.motivo);
}

// Mueve `cantidad` unidades de un producto entre 2 módulos de Stock -- cada
// módulo de Stock YA es, en los hechos, un almacén propio (ver stockCombinado
// en datosReportes.ts); esto solo formaliza el "traslado" que antes había que
// armar a mano con 2 ajustes sueltos sin relación entre sí. Resta del origen,
// suma al destino, y deja en el Kardex de AMBOS un "ajuste" con el motivo
// explícito (de/hacia qué almacén), en vez de generar una venta o compra falsa.
export async function transferirStock(
  supabase: SupabaseClient,
  empresaId: string,
  origen: { datasetId: string; claveProducto: string; nombre: string },
  destino: { datasetId: string; claveProducto: string; nombre: string },
  producto: string,
  cantidad: number,
  userId: string | null
): Promise<void> {
  if (!(cantidad > 0) || !producto.trim()) return;
  await ajustarStock(supabase, origen.datasetId, origen.claveProducto, producto, -cantidad, {
    empresaId, tipo: "ajuste", userId, motivo: `Traslado a "${destino.nombre}"`,
  });
  await ajustarStock(supabase, destino.datasetId, destino.claveProducto, producto, cantidad, {
    empresaId, tipo: "ajuste", userId, motivo: `Traslado desde "${origen.nombre}"`,
  });
}

// Si `columnas` (de un dataset recién escrito) clasifica como ventas o
// compras y tiene columna de Producto, busca su Stock enlazado y lo ajusta:
// +cantidad si es compra, -cantidad si es venta (1 por defecto si el
// registro no trae columna de cantidad). No hace nada si no hay Stock
// enlazado -- no todos los módulos de Ventas/Compras tienen uno.
// `signo`: -1 para deshacer el efecto de este registro en vez de aplicarlo
// (editar/eliminar, ver revertirStockDesdeRegistro) -- misma cuenta, signo
// invertido, para no duplicar la lógica de qué cantidad corresponde.
export async function ajustarStockDesdeRegistro(
  supabase: SupabaseClient,
  empresaId: string,
  columnas: Columna[],
  datos: Record<string, unknown>,
  signo: 1 | -1 = 1,
  userId: string | null = null
): Promise<void> {
  const tipoDelModulo = tipoModulo(columnas.map((c) => c.rol));
  // Un módulo "otro" (ej. Órdenes de servicio) también entra -- SOLO llega a
  // descontar algo si, más abajo, su Producto está enlazado específicamente
  // a un Menú (ver dispatchDescontarInsumosMenu -> datasetMenuDe). Para
  // cualquier otro "otro" (ej. Traslados, enlazado a un Stock real) esto es
  // un no-op seguro: datasetMenuDe exige que el destino tenga columna
  // "composicion", que un Stock normal nunca tiene.
  if (tipoDelModulo !== "compras" && tipoDelModulo !== "ventas" && tipoDelModulo !== "otro") return;

  const cProducto = columnas.find((c) => c.rol === "producto");
  if (!cProducto) return;
  const producto = datos[cProducto.key]?.toString().trim();
  if (!producto) return;

  const cCantidad = columnas.find((c) => c.rol === "cantidad");
  const cantidadCruda = cCantidad ? Number(datos[cCantidad.key]) : NaN;
  const cantidad = Number.isFinite(cantidadCruda) && cantidadCruda > 0 ? cantidadCruda : 1;

  // El camino de Stock DIRECTO (descontar la columna "cantidad" de un Stock
  // de verdad) sigue exclusivo de Ventas/Compras -- nunca para un módulo
  // "otro" (ej. Traslados, que YA tiene su propio mecanismo con un Producto
  // enlazado a Stock real, ver transferirStock: si "otro" entrara acá
  // también, un Traslados con esta automatización activada descontaría
  // Stock DOS VECES).
  if (tipoDelModulo === "ventas" || tipoDelModulo === "compras") {
    const stock = await datasetStockDe(supabase, empresaId, columnas);
    if (stock) {
      const tipo: TipoMovimientoStock = tipoDelModulo === "compras" ? "compra" : "venta";
      await ajustarStock(supabase, stock.id, stock.claveProducto, producto, signo * (tipoDelModulo === "compras" ? cantidad : -cantidad), {
        empresaId,
        tipo,
        userId,
      });
      return;
    }
    if (tipoDelModulo === "compras") return; // comprar insumos sigue siendo directo a Stock, nunca "comprando" un ítem del Menú
  }

  // Producto enlazado a un Menú (ventas sin Stock directo, o cualquier
  // módulo "otro" como Órdenes de servicio -- un trabajo/servicio realizado
  // también consume insumos): descuenta CADA insumo de su composición,
  // multiplicado por la cantidad.
  //
  // OJO (encontrado probando en vivo): esto solo corre si la regla activa es
  // literalmente `{accion:{tipo:"ajustar_stock"}}` -- un módulo cuyo "Ajustar
  // Stock automáticamente" quedó guardado en su forma vieja homologada a mano
  // (`sumar_campo_enlazado` con columnaObjetivoKey:"cantidad", ver recetas.ts)
  // NUNCA llega a esta función: ese otro camino (reglasAplicar.ts,
  // dispatchSumarCampoEnlazado) solo sabe sumar un campo "cantidad" a ciegas,
  // y como un Menú no tiene ese campo, termina creándolo como basura en la
  // fila del Menú en vez de tocar el Stock real. Para un módulo así, hay que
  // Desactivar y volver a Activar "Ajustar Stock automáticamente" en
  // Automatizaciones -- `aplicarPlantilla` reconstruye la regla en su forma
  // canónica `ajustar_stock`, que sí pasa por acá.
  await dispatchDescontarInsumosMenu(supabase, empresaId, columnas, producto, signo * cantidad, userId);
}

// Busca la fila del Menú para `producto`, lee su columna "composicion" (texto
// "Insumo:cantidad, ...") y descuenta cada insumo del PRIMER módulo de Stock
// real de la empresa -- ponytail: un solo almacén real por empresa para esto;
// si algún día hace falta separar insumos en más de un almacén, acá es donde
// ampliar (hoy ninguna empresa de prueba lo necesitó).
async function dispatchDescontarInsumosMenu(
  supabase: SupabaseClient,
  empresaId: string,
  columnasVenta: Columna[],
  producto: string,
  unidadesVendidas: number,
  userId: string | null
): Promise<void> {
  const menu = await datasetMenuDe(supabase, empresaId, columnasVenta);
  if (!menu) return;

  const { data: filaMenu } = await supabase
    .from("records")
    .select("data")
    .eq("dataset_id", menu.id)
    .eq(`data->>${menu.claveProducto}`, producto)
    .maybeSingle();
  const composicionTexto = filaMenu ? String((filaMenu.data as Record<string, unknown>)[menu.claveComposicion] ?? "") : "";
  const insumos = parsearReceta(composicionTexto);
  if (insumos.length === 0) return; // ítem del Menú sin composición cargada: no descuenta nada (ver diseño, "opcional por ítem")

  const { data: datasets } = await supabase.from("datasets").select("id, columnas").eq("empresa_id", empresaId);
  const stockReal = (datasets ?? []).find((d) => esStock(d.columnas as Columna[]));
  if (!stockReal) return;
  const cProductoStock = (stockReal.columnas as Columna[]).find((c) => c.rol === "producto");
  if (!cProductoStock) return;

  for (const insumo of insumos) {
    await ajustarStock(supabase, stockReal.id, cProductoStock.key, insumo.nombre, -unidadesVendidas * insumo.cantidad, {
      empresaId,
      tipo: "venta",
      userId,
      motivo: `Insumo de "${producto}" (Menú)`,
    });
  }
}

// Al editar un registro: deshace el efecto que tenía en Stock con los datos
// VIEJOS, y aplica el efecto de los datos NUEVOS -- así un cambio de
// producto o de cantidad (o pasar de compra a venta, si el módulo tiene
// Tipo de movimiento) ajusta el stock correctamente en vez de sumar/restar
// dos veces. Al eliminar un registro: solo deshace (sin aplicar nada nuevo).
// Igual que ajustarStockDesdeRegistro, es "mejor esfuerzo": si falla, no
// debe tumbar la edición/eliminación, que ya es lo importante.
export async function revertirStockDesdeRegistro(
  supabase: SupabaseClient,
  empresaId: string,
  columnas: Columna[],
  datosViejos: Record<string, unknown>,
  datosNuevos?: Record<string, unknown>,
  userId: string | null = null
): Promise<void> {
  await ajustarStockDesdeRegistro(supabase, empresaId, columnas, datosViejos, -1, userId);
  if (datosNuevos) await ajustarStockDesdeRegistro(supabase, empresaId, columnas, datosNuevos, 1, userId);
}

// Editar o crear una fila A MANO en el propio módulo de Stock (no vía una venta
// o compra, que ya queda cubierto arriba) -- un conteo físico, una merma, una
// corrección. Se registra como "ajuste" para que el Kardex no tenga huecos:
// todo cambio de cantidad queda con su origen, lo haya disparado una venta,
// una compra, o el dueño corrigiendo el número a mano.
export async function registrarAjusteManual(
  supabase: SupabaseClient,
  empresaId: string,
  datasetId: string,
  columnas: Columna[],
  datosViejos: Record<string, unknown> | null,
  datosNuevos: Record<string, unknown>,
  userId: string | null,
  motivo?: string | null
): Promise<void> {
  if (!esStock(columnas)) return;
  const cProducto = columnas.find((c) => c.rol === "producto");
  if (!cProducto) return;
  const producto = datosNuevos[cProducto.key]?.toString().trim();
  if (!producto) return;

  const cantidadVieja = datosViejos ? Number(datosViejos.cantidad) || 0 : 0;
  const cantidadNueva = Number(datosNuevos.cantidad) || 0;
  const delta = cantidadNueva - cantidadVieja;
  if (delta === 0) return;

  await registrarMovimiento(supabase, empresaId, datasetId, producto, "ajuste", delta, cantidadNueva, userId, motivo);
}
