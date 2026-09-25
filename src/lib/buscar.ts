export function normalizar(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // saca tildes, así "jose" encuentra "José"
}

// Búsqueda simple tipo "todas las palabras deben aparecer en algún campo del
// registro" (AND), sin importar mayúsculas/tildes ni en qué columna estén.
export function filtrarRegistros<T extends { data: Record<string, unknown> }>(
  registros: T[],
  busqueda: string
): T[] {
  const terminos = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (terminos.length === 0) return registros;
  return registros.filter((r) => {
    const textoFila = normalizar(Object.values(r.data).join(" "));
    return terminos.every((t) => textoFila.includes(t));
  });
}
