import type { RolColumna } from "./roles.ts";

// Catálogo de los reportes que Frondix puede armar solo, y qué roles de columna
// necesita cada uno. No es un paso nuevo de configuración: los reportes siguen
// saliendo automáticamente de los roles que el usuario ya marca (ver reportes.ts
// y /api/reportes) -- esto es solo la capa de "qué significa cada combinación",
// compartida entre el wizard de carga (para mostrar qué se va a armar) y la
// pantalla de Reportes (para explicar por qué salió cada uno).
export interface PlantillaReporte {
  id: string;
  nombre: string;
  descripcion: string;
  rolesNecesarios: RolColumna[];
}

export const PLANTILLAS_REPORTE: PlantillaReporte[] = [
  { id: "flujo_caja", nombre: "Flujo de caja", descripcion: "Ventas, costos, IGV y ganancia.", rolesNecesarios: ["monto", "costo"] },
  { id: "ventas_mensuales", nombre: "Ventas por mes", descripcion: "Cuánto vendiste cada mes, en una barra.", rolesNecesarios: ["monto", "fecha"] },
  { id: "top_productos", nombre: "Productos más vendidos", descripcion: "Ranking de tus productos o conceptos.", rolesNecesarios: ["producto"] },
  { id: "top_clientes", nombre: "Mejores clientes", descripcion: "Ranking de tus clientes.", rolesNecesarios: ["cliente"] },
  { id: "top_proveedores", nombre: "Proveedores por monto", descripcion: "A quién le compras más.", rolesNecesarios: ["proveedor"] },
  { id: "total_simple", nombre: "Total sumado", descripcion: "Suma general, para módulos de caja sin fecha.", rolesNecesarios: ["monto"] },
];

// Qué plantillas quedan armadas con los roles que ya se marcaron en estas columnas.
// "Total sumado" es el caso degradado de "Ventas por mes" sin fecha (ver /api/reportes):
// si hay fecha, sale el de por mes, no el total suelto -- para no mostrar los dos a la vez.
export function plantillasCubiertas(roles: (RolColumna | null | "")[]): PlantillaReporte[] {
  const presentes = new Set(roles.filter(Boolean));
  return PLANTILLAS_REPORTE.filter((p) => {
    if (!p.rolesNecesarios.every((r) => presentes.has(r))) return false;
    if (p.id === "total_simple" && (presentes.has("fecha") || presentes.has("costo"))) return false;
    return true;
  });
}

// Qué le falta a una plantilla para armarse, en roles legibles.
export function rolesFaltantes(plantilla: PlantillaReporte, roles: (RolColumna | null | "")[]): RolColumna[] {
  const presentes = new Set(roles.filter(Boolean));
  return plantilla.rolesNecesarios.filter((r) => !presentes.has(r));
}
