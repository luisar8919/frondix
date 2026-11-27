import { tipoModulo, esInterfazAtencion } from "./roles";
import type { Columna } from "./excel-parser";

// Fuente única de verdad de qué "interfaces" especializadas existen (Punto de
// Venta, Atención) y qué las hace aplicar estructuralmente -- agregar una
// nueva a futuro es sumar una entrada acá, nunca tocar BarraPanel/la página
// de Configuración > Interfaces.
export interface DefInterfaz {
  key: string;
  label: string;
  href: string;
  aplica: (datasets: { nombre: string; columnas: Columna[] }[]) => boolean;
}

export const INTERFACES_DISPONIBLES: DefInterfaz[] = [
  {
    key: "pos",
    label: "Punto de Venta",
    href: "/dashboard/pos",
    aplica: (datasets) => datasets.some((d) => tipoModulo(d.columnas.map((c) => c.rol), d.nombre) === "ventas"),
  },
  {
    key: "atencion",
    label: "Atención",
    href: "/dashboard/ventanilla",
    aplica: (datasets) => datasets.some((d) => esInterfazAtencion(d.columnas)),
  },
];

// Las que de verdad hay que mostrar: aplican estructuralmente Y no fueron
// apagadas a mano en Configuración > Interfaces (empresas.interfaces_desactivadas).
export function interfacesVisibles(
  datasets: { nombre: string; columnas: Columna[] }[],
  desactivadas: string[]
): { key: string; label: string; href: string }[] {
  return INTERFACES_DISPONIBLES.filter((i) => i.aplica(datasets) && !desactivadas.includes(i.key)).map((i) => ({
    key: i.key,
    label: i.label,
    href: i.href,
  }));
}
