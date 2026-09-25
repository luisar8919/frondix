// "Rol" = qué significa una columna para el negocio (no solo su tipo de dato).
// El asistente lo necesita para saber, por ejemplo, cuál es el monto de una venta.
export type RolColumna = "monto" | "fecha" | "cliente" | "producto" | "telefono";

export const ROLES: { valor: RolColumna; etiqueta: string }[] = [
  { valor: "monto", etiqueta: "Monto (importe de la venta o movimiento)" },
  { valor: "fecha", etiqueta: "Fecha" },
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "producto", etiqueta: "Producto o concepto" },
  { valor: "telefono", etiqueta: "Teléfono (para WhatsApp)" },
];

// El orden importa: "Teléfono del cliente" debe caer en telefono, no en cliente,
// y "Nombre del producto" en producto, no en cliente.
const REGLAS: { rol: RolColumna; patron: RegExp; tipo?: string }[] = [
  { rol: "telefono", patron: /tel|cel|whats|movil|fono/ },
  { rol: "fecha", patron: /fecha|date/, tipo: "fecha" },
  { rol: "monto", patron: /monto|venta|importe|total|precio|ingreso|entrada/, tipo: "numero" },
  { rol: "producto", patron: /producto|juego|item|articulo|descripcion|concepto|detalle/, tipo: "texto" },
  { rol: "cliente", patron: /cliente|comprador|nombre/, tipo: "texto" },
];

function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
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
