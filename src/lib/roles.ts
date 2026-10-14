// "Rol" = qué significa una columna para el negocio (no solo su tipo de dato).
// El asistente lo necesita para saber, por ejemplo, cuál es el monto de una venta.
export type RolColumna = "monto" | "fecha" | "cliente" | "producto" | "telefono" | "costo" | "proveedor" | "gastos" | "tipo_movimiento" | "stock" | "cantidad";

export const ROLES: { valor: RolColumna; etiqueta: string }[] = [
  { valor: "monto", etiqueta: "Monto (importe de la venta o movimiento)" },
  { valor: "costo", etiqueta: "Costo (lo que te costó vender o producir)" },
  { valor: "gastos", etiqueta: "Gastos adicionales (envío, comisión, etc.)" },
  { valor: "cantidad", etiqueta: "Cantidad (unidades de ese movimiento)" },
  { valor: "fecha", etiqueta: "Fecha" },
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "proveedor", etiqueta: "Proveedor (a quién le compras)" },
  { valor: "producto", etiqueta: "Producto o concepto" },
  { valor: "telefono", etiqueta: "Teléfono (para WhatsApp)" },
  { valor: "tipo_movimiento", etiqueta: "Tipo de movimiento (si cada fila dice si es venta o compra)" },
  { valor: "stock", etiqueta: "Stock (cuánto tienes ahora de ese producto)" },
];

// El orden importa: "Teléfono del cliente" debe caer en telefono, no en cliente,
// "Nombre del producto" en producto, no en cliente, "proveedor" antes que
// "cliente" porque si no "Nombre del proveedor" caería en cliente (su patrón
// incluye "nombre"), y "costo" antes que "monto" no hace falta porque sus
// patrones no se cruzan (ninguna palabra de costo aparece en el patrón de monto).
// "gastos" no tiene regla acá a propósito: su significado se superpone con
// "costo" (que ya reconoce la palabra "gasto") -- se asigna a mano o viene
// ya puesto en las plantillas de Compras/Ventas (ver plantillasModulo.ts),
// nunca por detección automática, para no competir con "costo" en Excels reales.
const REGLAS: { rol: RolColumna; patron: RegExp; tipo?: string }[] = [
  { rol: "telefono", patron: /tel|cel|whats|movil|fono/ },
  { rol: "fecha", patron: /fecha|date/, tipo: "fecha" },
  { rol: "tipo_movimiento", patron: /^tipo$|tipo.*(movim|transac|registro)/, tipo: "texto" },
  { rol: "stock", patron: /^stock$|inventario|existencia/, tipo: "numero" },
  { rol: "cantidad", patron: /^cant(idad)?\.?$|unidades|^qty$|^unid\.?$/, tipo: "numero" },
  { rol: "monto", patron: /monto|venta|importe|total|precio|ingreso|entrada/, tipo: "numero" },
  { rol: "costo", patron: /costo|gasto|egreso/, tipo: "numero" },
  { rol: "producto", patron: /producto|juego|item|articulo|descripcion|concepto|detalle/, tipo: "texto" },
  { rol: "proveedor", patron: /proveedor|vendedor|distribuidor/, tipo: "texto" },
  { rol: "cliente", patron: /cliente|comprador|nombre/, tipo: "texto" },
];

export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Para la columna "Tipo de movimiento": a qué lado (venta/compra) cae cada
// valor de fila, usado por el divisor automático (ver lib/divisor.ts).
export function esVenta(valor: unknown): boolean {
  return /venta|ingreso|entrada/.test(normalizar(String(valor ?? "")));
}

export function esCompra(valor: unknown): boolean {
  return /compra|egreso|salida/.test(normalizar(String(valor ?? "")));
}

// Propone un rol por columna (máximo una columna por rol). Es solo una
// sugerencia: la UI la muestra y el usuario la confirma o la cambia.
export function sugerirRoles(
  columnas: { key: string; label: string; tipo: string }[]
): Record<string, RolColumna> {
  const asignados: Record<string, RolColumna> = {};
  for (const { rol, patron, tipo } of REGLAS) {
    const candidata = columnas.find(
      (c) => !(c.key in asignados) && patron.test(normalizar(c.label)) && (!tipo || c.tipo === tipo)
    );
    if (candidata) asignados[candidata.key] = rol;
  }
  return asignados;
}

// En qué pestaña (Compras/Ventas) cae un módulo, según los roles que ya tiene
// marcados -- no es un campo nuevo que haya que elegir, se deduce de lo mismo
// que ya alimenta los reportes. "Proveedor" manda (es la señal más clara de
// que es un gasto/compra); si no, Producto+Monto o Cliente lo marca como venta.
export type TipoModulo = "compras" | "ventas" | "otro";

export function tipoModulo(roles: (RolColumna | null | "")[]): TipoModulo {
  const presentes = new Set(roles.filter(Boolean));
  if (presentes.has("proveedor")) return "compras";
  if (presentes.has("cliente") || (presentes.has("producto") && presentes.has("monto"))) return "ventas";
  return "otro";
}

// Roles que, SI la tabla tiene una columna marcada así, no se puede dejar en blanco
// al registrar (a mano o editando) -- sin esto se guardaban ventas/compras sin
// monto ni producto ni contraparte, que después ni Reportes ni Seguimiento pueden
// usar. No son los únicos campos del módulo, solo los mínimos para que el registro
// tenga sentido de negocio; "otro" (una tabla sin clasificar) no obliga nada.
const OBLIGATORIOS_POR_TIPO: Record<TipoModulo, RolColumna[]> = {
  ventas: ["monto", "producto", "cliente"],
  compras: ["monto", "producto", "proveedor"],
  otro: [],
};

export function camposObligatorios(tipo: TipoModulo): RolColumna[] {
  return OBLIGATORIOS_POR_TIPO[tipo];
}

// Roles numéricos donde un valor negativo no tiene sentido de negocio (un monto,
// un costo o una cantidad negativa es casi siempre un error de tipeo, no una
// operación real) -- "stock" queda afuera a propósito: negativo ahí SÍ es válido
// (se vendió algo antes de registrar que se compró, ver lib/stock.ts).
const ROLES_SIN_NEGATIVOS = new Set<RolColumna>(["monto", "costo", "gastos", "cantidad"]);

export function admiteNegativos(rol: RolColumna | null | ""): boolean {
  return !rol || !ROLES_SIN_NEGATIVOS.has(rol);
}

// Mismas reglas que el formulario (ver DynamicForm.tsx), del lado del servidor --
// el formulario ya las aplica, pero POST/PATCH de /api/records se pueden llamar
// directo sin pasar por él, así que no alcanza con validar solo en el cliente.
export function validarCamposRegistro(
  columnas: { key: string; label: string; rol: RolColumna | null; tipo: string }[],
  datos: Record<string, unknown>
): string | null {
  const obligatorios = new Set(camposObligatorios(tipoModulo(columnas.map((c) => c.rol))));
  for (const c of columnas) {
    if (!c.rol || !obligatorios.has(c.rol)) continue;
    const v = datos[c.key];
    if (v === null || v === undefined || String(v).trim() === "") return `Falta completar "${c.label}".`;
  }
  for (const c of columnas) {
    if (c.tipo !== "numero" || admiteNegativos(c.rol)) continue;
    const v = datos[c.key];
    if (v !== null && v !== undefined && Number(v) < 0) return `"${c.label}" no puede ser negativo.`;
  }
  return null;
}

// Una tabla es "confusa" para las reglas de arriba cuando no reconocieron nada, o cuando
// muchas columnas quedaron marcadas "sospechosa" (el encabezado en realidad era un dato).
// En ese caso conviene ofrecer la sugerencia por IA en vez de dejar todo en blanco.
export function estructuraConfusa(columnas: { rol: string | null; sospechosa: boolean }[]): boolean {
  if (columnas.length === 0) return false;
  const sinNingunRol = columnas.every((c) => !c.rol);
  const proporcionSospechosa = columnas.filter((c) => c.sospechosa).length / columnas.length;
  return sinNingunRol || proporcionSospechosa > 0.4;
}
