import type { ModuloReporte } from "./datosReportes.ts";

// Catálogo de recomendaciones deterministas, construido a partir de los temas que
// Gemini ya venía repitiendo en el bloque "Recomendación" de los highlights (ganancia
// negativa, un solo producto concentrando las ventas, caída mes a mes, meta por
// cumplirse, gastos altos). En vez de pedirle a la IA que la redacte de cero cada vez
// -- con el riesgo de que varíe el tono o directamente invente -- cuando los números
// calzan con un patrón conocido se usa este texto fijo, sin llamar a Gemini para esa
// parte. Gemini sigue armando el resto del reporte (resumen financiero, top ventas,
// otros datos) con el prompt de siempre; ver /api/highlights/route.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Patron<T = any> {
  id: string;
  // Menor número = se evalúa primero. Con varios patrones aplicables a la vez, se usa
  // el de mayor prioridad (el más urgente/accionable) -- el bloque "Recomendación"
  // siempre fue una sola sugerencia, no una lista.
  prioridad: number;
  // Devuelve lo que necesita texto() para redactar (el módulo que calzó + cualquier
  // número ya calculado), o null si el patrón no aplica a ningún módulo.
  detectar: (modulos: ModuloReporte[]) => T | null;
  texto: (hallazgo: T) => string;
}

const CATALOGO: Patron[] = [
  {
    id: "ganancia_negativa",
    prioridad: 1,
    detectar: (modulos) => modulos.find((m) => m.flujoCaja && m.flujoCaja.gananciaNeta < 0) ?? null,
    texto: (m: ModuloReporte) =>
      `Ojo con "${m.nombre}": tus costos ya superan tus ventas ahí (ganancia neta de S/ ${m.flujoCaja!.gananciaNeta}). Antes de seguir vendiendo así, revisa tus precios o de dónde vienen esos costos.`,
  } satisfies Patron<ModuloReporte>,

  {
    id: "tendencia_caida",
    prioridad: 2,
    detectar: (modulos) => {
      for (const m of modulos) {
        if (!m.totalesPorMes || m.totalesPorMes.length < 2) continue;
        const ultimo = m.totalesPorMes[m.totalesPorMes.length - 1];
        const anterior = m.totalesPorMes[m.totalesPorMes.length - 2];
        if (anterior.total <= 0) continue;
        const caida = 1 - ultimo.total / anterior.total;
        if (caida >= 0.4) return { modulo: m, porcentaje: Math.round(caida * 100) };
      }
      return null;
    },
    texto: ({ modulo, porcentaje }: { modulo: ModuloReporte; porcentaje: number }) =>
      `Tus ventas en "${modulo.nombre}" bajaron ${porcentaje}% respecto al mes anterior. Vale la pena revisar qué cambió -- menos clientes, menos stock, o la época del año.`,
  } satisfies Patron<{ modulo: ModuloReporte; porcentaje: number }>,

  {
    id: "concentracion_producto",
    prioridad: 3,
    detectar: (modulos) => {
      for (const m of modulos) {
        if (!m.topProducto || m.topProducto.length < 2) continue;
        const suma = m.topProducto.reduce((s, p) => s + (p.total || p.veces), 0);
        if (suma <= 0) continue;
        const top1 = m.topProducto[0];
        const participacion = (top1.total || top1.veces) / suma;
        if (participacion >= 0.6) return { modulo: m, porcentaje: Math.round(participacion * 100), producto: top1.clave };
      }
      return null;
    },
    texto: ({ modulo, porcentaje, producto }: { modulo: ModuloReporte; porcentaje: number; producto: string }) =>
      `En "${modulo.nombre}", el ${porcentaje}% de lo que se mueve depende de un solo producto (${producto}). Si te falla ese producto, te falla el módulo entero -- conviene diversificar.`,
  } satisfies Patron<{ modulo: ModuloReporte; porcentaje: number; producto: string }>,

  {
    id: "meta_cerca",
    prioridad: 4,
    detectar: (modulos) => {
      for (const m of modulos) {
        const meta = m.metas?.find((x) => !x.alcanzada && x.porcentaje >= 80);
        if (meta) return { modulo: m, meta };
      }
      return null;
    },
    texto: ({ modulo, meta }: { modulo: ModuloReporte; meta: NonNullable<ModuloReporte["metas"]>[number] }) =>
      `Estás cerca de cumplir tu meta de "${meta.producto}" en "${modulo.nombre}" (${meta.porcentaje}% ya logrado, faltan ${meta.faltan}). Un último empujón y la cierras.`,
  } satisfies Patron<{ modulo: ModuloReporte; meta: NonNullable<ModuloReporte["metas"]>[number] }>,

  {
    id: "gastos_altos",
    prioridad: 5,
    detectar: (modulos) => {
      for (const m of modulos) {
        const ventas = m.flujoCaja?.ventas ?? m.sumaTotal;
        if (!m.sumaGastos || !ventas || ventas <= 0) continue;
        const proporcion = m.sumaGastos / ventas;
        if (proporcion >= 0.2) return { modulo: m, porcentaje: Math.round(proporcion * 100) };
      }
      return null;
    },
    texto: ({ modulo, porcentaje }: { modulo: ModuloReporte; porcentaje: number }) =>
      `Los gastos adicionales de "${modulo.nombre}" ya representan el ${porcentaje}% de tus ventas ahí. Revisa si hay alguno que se pueda recortar sin afectar el negocio.`,
  } satisfies Patron<{ modulo: ModuloReporte; porcentaje: number }>,
];

// Recorre el catálogo por prioridad y devuelve la primera recomendación que calce con
// los datos de la empresa, o null si ninguna aplica (en ese caso el bloque
// "Recomendación" lo sigue redactando Gemini como antes, sin reemplazo).
export function sugerirRecomendacion(modulos: ModuloReporte[]): string | null {
  for (const patron of CATALOGO) {
    const hallazgo = patron.detectar(modulos);
    if (hallazgo !== null) return patron.texto(hallazgo);
  }
  return null;
}
