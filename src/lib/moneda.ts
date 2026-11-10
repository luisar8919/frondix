export type Moneda = "PEN" | "USD" | "MXN" | "COP" | "CLP" | "ARS" | "BRL" | "EUR";

// Frondix apunta a toda América (no solo Perú) -- divisas de los mercados más
// comunes de la región, además de Soles/Dólares que ya existían.
export const MONEDAS: { valor: Moneda; etiqueta: string; simbolo: string }[] = [
  { valor: "PEN", etiqueta: "Soles peruanos (S/)", simbolo: "S/" },
  { valor: "USD", etiqueta: "Dólares (US$)", simbolo: "US$" },
  { valor: "MXN", etiqueta: "Pesos mexicanos ($)", simbolo: "$" },
  { valor: "COP", etiqueta: "Pesos colombianos ($)", simbolo: "$" },
  { valor: "CLP", etiqueta: "Pesos chilenos ($)", simbolo: "$" },
  { valor: "ARS", etiqueta: "Pesos argentinos ($)", simbolo: "$" },
  { valor: "BRL", etiqueta: "Reales brasileños (R$)", simbolo: "R$" },
  { valor: "EUR", etiqueta: "Euros (€)", simbolo: "€" },
];

const SIMBOLO: Record<Moneda, string> = Object.fromEntries(MONEDAS.map((m) => [m.valor, m.simbolo])) as Record<Moneda, string>;

// Cada módulo tiene su propia moneda (columna "moneda" en datasets, migración
// 21) -- esto solo cambia el símbolo, no convierte nada. Sumar montos de
// módulos con monedas distintas en un mismo total (Balance, Cuentas por
// cobrar/pagar, Valorización) todavía asume que todo es la misma moneda; ver
// nota en esos lugares.
export function formatearMonto(n: number, moneda: Moneda | string = "PEN"): string {
  const simbolo = SIMBOLO[moneda as Moneda] ?? SIMBOLO.PEN;
  return `${simbolo} ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
}
