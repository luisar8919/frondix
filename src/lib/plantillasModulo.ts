import type { Columna } from "./excel-parser.ts";

// Columnas iniciales para crear un módulo de Compras o Ventas sin subir Excel
// -- el mismo significado (rol) que ya detecta sugerirRoles, así que el módulo
// queda automáticamente enganchado a Reportes, a la pestaña Compras/Ventas
// (ver tipoModulo) y al botón "+ Registrar compra/venta".
export function plantillaVentas(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "costo", label: "Costo", tipo: "numero", rol: "costo", sospechosa: false },
  ];
}

export function plantillaCompras(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "proveedor", label: "Proveedor", tipo: "texto", rol: "proveedor", sospechosa: false },
    { key: "producto", label: "Producto o concepto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
  ];
}
