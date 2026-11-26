// Supabase corta cada respuesta en 1000 filas -- para leer un dataset entero
// hay que pedirlo por páginas hasta que una venga incompleta. Este mismo loop
// estaba copiado en ~10 lugares (api/calendario, api/seguimiento, los 2 cron,
// export, records/valores, clientes.ts, datosReportes.ts, historialCliente.ts,
// proveedores.ts x2) -- centralizado acá para que un cambio futuro (ej. el
// tamaño de página) no requiera tocar cada archivo por separado.
export const FILAS_POR_PAGINA = 1000;
// Tope por defecto si el llamador no pide uno más chico (ver historialCliente.ts,
// que usa 5000 porque le alcanza de sobra con el historial de un solo cliente).
export const TOPE_FILAS_POR_DEFECTO = 20000;

// `data: unknown` a propósito: un `.select("a:data->>b, ...")` de Supabase con
// alias dinámicos siempre resuelve a un tipo genérico que no coincide con la
// forma real de la fila (mismo motivo por el que el código de antes de este
// helper hacía `as unknown as typeof filas` en cada llamador) -- acá se cast
// una sola vez, en el único lugar que de verdad sabe qué pidió cada llamador.
export async function leerTodasLasFilas<T>(
  construirPagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  topeFilas = TOPE_FILAS_POR_DEFECTO
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; desde < topeFilas; desde += FILAS_POR_PAGINA) {
    const { data, error } = await construirPagina(desde, desde + FILAS_POR_PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data as T[] | null) ?? [];
    filas.push(...pagina);
    if (pagina.length < FILAS_POR_PAGINA) break;
  }
  return filas;
}
