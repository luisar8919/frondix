export type Moneda = "PEN" | "USD";

export const MONEDAS: { valor: Moneda; etiqueta: string; simbolo: string }[] = [
  { valor: "PEN", etiqueta: "Soles (S/)", simbolo: "S/" },
  { valor: "USD", etiqueta: "Dólares ($)", simbolo: "$" },
];

const SIMBOLO: Record<Moneda, string> = { PEN: "S/", USD: "$" };

// Cada módulo tiene su propia moneda (columna "moneda" en datasets, migración
// 21) -- esto solo cambia el símbolo, no convierte nada. Sumar montos de
// módulos con monedas distintas en un mismo total (Balance, Cuentas por
// cobrar/pagar, Valorización) todavía asume que todo es la misma moneda; ver
// nota en esos lugares.
export function formatearMonto(n: number, moneda: Moneda | string = "PEN"): string {
  const simbolo = SIMBOLO[moneda as Moneda] ?? SIMBOLO.PEN;
  return `${simbolo} ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
}
