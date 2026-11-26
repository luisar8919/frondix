// Fake minimo de un cliente de Supabase, SOLO para los tests de este proyecto
// (prefijo "_" a propósito: no es un test en si, "npm test" no lo corre
// directo). Reproduce lo justo y necesario de la cadena .from().select()...
// que ya usan clientes.ts/proveedores.ts/historialCliente.ts: `select` con
// alias "a:data->>key" proyecta desde la columna JSONB `data` de cada fila
// (igual que Postgres/PostgREST de verdad), un select de columnas planas
// ("clave, nombre, telefono") pasa esas columnas tal cual.
function proyectar(fila, seleccion) {
  if (seleccion.includes("->>")) {
    const salida = {};
    for (const parte of seleccion.split(",").map((s) => s.trim())) {
      const [alias, resto] = parte.split(":");
      const key = resto.split("->>")[1];
      salida[alias] = fila.data?.[key] ?? null;
    }
    return salida;
  }
  const salida = {};
  for (const col of seleccion.split(",").map((s) => s.trim())) salida[col] = fila[col];
  return salida;
}

export function fakeSupabase(tablas) {
  return {
    from(nombreTabla) {
      let seleccion = "*";
      const filtros = [];
      const api = {
        select(s) { seleccion = s; return api; },
        eq(col, val) { filtros.push([col, val]); return api; },
        order() { return api; },
        range(desde, hasta) {
          return Promise.resolve(resolver()).then((r) => ({ ...r, data: r.data?.slice(desde, hasta + 1) ?? null }));
        },
        then(onResuelto, onError) {
          return Promise.resolve(resolver()).then(onResuelto, onError);
        },
      };
      function resolver() {
        const filas = (tablas[nombreTabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v));
        return { data: filas.map((f) => proyectar(f, seleccion)), error: null };
      }
      return api;
    },
  };
}
