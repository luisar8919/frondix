import type { Columna } from "./excel-parser.ts";

export interface DatasetResumen {
  id: string;
  nombre: string;
  columnas: Columna[];
}

// Las claves de columna salen del parser (a-z, 0-9 y guion bajo). Se validan antes de
// usarlas en un filtro del servidor para que nunca entre texto arbitrario.
export const CLAVE_VALIDA = /^[a-z0-9_]+$/;

export function claveValida(clave: unknown): clave is string {
  return typeof clave === "string" && clave.length > 0 && clave.length <= 80 && CLAVE_VALIDA.test(clave);
}

export interface OpcionEnlace {
  valor: string; // "<datasetId>|<columnaKey>"
  etiqueta: string; // "Clientes > Nombre"
}

// Todas las columnas de las OTRAS tablas a las que se puede enlazar una columna.
export function opcionesDeEnlace(datasets: DatasetResumen[], actualId: string): OpcionEnlace[] {
  return datasets
    .filter((d) => d.id !== actualId)
    .flatMap((d) => d.columnas.map((c) => ({ valor: `${d.id}|${c.key}`, etiqueta: `${d.nombre} > ${c.label}` })));
}

export function codificarEnlace(e: { datasetId: string; columnaKey: string } | null | undefined): string {
  return e ? `${e.datasetId}|${e.columnaKey}` : "";
}

export function decodificarEnlace(valor: string): { datasetId: string; columnaKey: string } | null {
  const [datasetId, columnaKey] = valor.split("|");
  return datasetId && columnaKey ? { datasetId, columnaKey } : null;
}

export interface RelacionEntrante {
  datasetId: string; // la otra tabla, la que apunta a esta
  nombre: string;
  columnaKey: string; // columna de la otra tabla que tiene el enlace
  miColumnaKey: string; // columna de ESTA tabla a la que apunta
}

// Tablas que tienen una columna enlazada a esta tabla (para poder ir "hacia atras").
export function relacionesEntrantes(datasets: DatasetResumen[], actualId: string): RelacionEntrante[] {
  return datasets
    .filter((d) => d.id !== actualId)
    .flatMap((d) =>
      d.columnas
        .filter((c) => c.enlace?.datasetId === actualId)
        .map((c) => ({ datasetId: d.id, nombre: d.nombre, columnaKey: c.key, miColumnaKey: c.enlace!.columnaKey }))
    );
}

// Deja solo los registros cuya columna vale exactamente `valor` (viene de un enlace).
export function filtrarPorColumna<T extends { data: Record<string, unknown> }>(
  registros: T[],
  clave: string | null | undefined,
  valor: string | null | undefined
): T[] {
  if (!clave || valor === null || valor === undefined) return registros;
  const buscado = valor.trim();
  return registros.filter((r) => String(r.data[clave] ?? "").trim() === buscado);
}

export function urlFiltrada(datasetId: string, columnaKey: string, valor: unknown): string {
  return `/dashboard/${datasetId}?filtrarCol=${encodeURIComponent(columnaKey)}&filtrarVal=${encodeURIComponent(String(valor))}`;
}
