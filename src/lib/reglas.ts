// "Reglas" = condición -> acción por módulo (modelo mental: Gambit System de
// FFXII -- elegís el "detonante" (cualquier campo ya mapeado del módulo, no
// solo Estado) y el umbral que lo activa -- pero evaluando TODAS las reglas
// activas que matcheen, en orden, no solo la primera: varios efectos de un
// mismo evento (ej. "Cancelado" -> excluir de reportes Y "siempre" -> ajustar
// stock) deben poder dispararse juntos, no competir entre sí. Vocabulario
// cerrado a propósito: nunca texto libre/código, solo lo que el usuario arma
// desde dropdowns en ReglasModulo.
//
// SOLO tipos y constantes acá -- sin ninguna lógica de ejecución ni imports de
// Node/servidor (Firebase, WhatsApp, admin de Supabase). ReglasModulo.tsx (un
// componente cliente) importa este archivo para los tipos/constantes del
// formulario; si la lógica de aplicarReglasDesdeRegistro viviera en el mismo
// archivo, Next.js intenta empaquetar sus imports de servidor (firebase-admin,
// que usa fs/net/tls) para el navegador y el build se rompe. Esa lógica vive
// en reglasAplicar.ts (servidor, nunca importado desde un componente cliente).
//
// "campo" es el tipo normal (cualquier columna del módulo, con el operador
// que corresponda a su tipo -- igual/distinto para texto, también
// mayor/menor para número). "estado" queda como alias legado SOLO para leer
// reglas guardadas antes de esta generalización (equivale a "campo" con
// operador "es") -- nunca se vuelve a escribir desde la UI.
export type Operador = "es" | "no_es" | "mayor" | "mayor_igual" | "menor" | "menor_igual";

export const OPERADORES_TEXTO: { valor: Operador; etiqueta: string }[] = [
  { valor: "es", etiqueta: "es igual a" },
  { valor: "no_es", etiqueta: "es distinto de" },
];
export const OPERADORES_NUMERO: { valor: Operador; etiqueta: string }[] = [
  { valor: "es", etiqueta: "es igual a" },
  { valor: "no_es", etiqueta: "es distinto de" },
  { valor: "mayor", etiqueta: "es mayor que" },
  { valor: "mayor_igual", etiqueta: "es mayor o igual que" },
  { valor: "menor", etiqueta: "es menor que" },
  { valor: "menor_igual", etiqueta: "es menor o igual que" },
];

export type Condicion =
  | { tipo: "siempre" }
  | { tipo: "campo"; columnaKey: string; operador: Operador; valor: string }
  | { tipo: "estado"; columnaKey: string; valor: string }; // legado, ver comentario arriba

export type Accion =
  | { tipo: "excluir_de_reportes" }
  | { tipo: "cambiar_estado"; columnaKey: string; valor: string }
  | { tipo: "ajustar_stock" } // reusa stock.ts tal cual -- ver comentario en reglasAplicar.ts
  // Manda el mensaje tal cual (sin plantillas {nombre}/etc -- eso es de
  // Seguimiento) al campo con rol "telefono" de ESTE registro. Mejor esfuerzo:
  // la API de WhatsApp solo entrega texto libre si el cliente te escribió en
  // las últimas 24h (ver enviarTexto en whatsapp.ts); fuera de esa ventana
  // simplemente no se manda, sin romper el resto de la regla.
  | { tipo: "enviar_whatsapp"; mensaje: string }
  // Activa el seguimiento (misma tabla y mecanismo que el checkbox manual de
  // /dashboard/seguimiento) para el cliente del campo rol "cliente" de este
  // registro -- el cron ya existente (api/cron/seguimiento-push) se encarga
  // de avisar si se queda callado, no hace falta nada más acá.
  | { tipo: "agregar_seguimiento" }
  // Push a todos los miembros de la empresa (Firebase, misma función que ya
  // usa el cron de seguimiento).
  | { tipo: "notificacion_push"; titulo: string; mensaje: string }
  // Generaliza ajustar_stock a CUALQUIER campo numérico de CUALQUIER módulo
  // enlazado (no solo Stock) -- ej. sumar 1 a "Visitas" en Clientes por cada
  // venta. Mismo patrón de "buscar fila por el valor enlazado, sumar o crear"
  // que ajustarStock() en stock.ts, pero sin Kardex (eso es específico de
  // Stock). `columnaEnlaceKey` es una columna de ESTE módulo con `.enlace`;
  // `columnaObjetivoKey` es el campo numérico a sumar en el dataset enlazado.
  | { tipo: "sumar_campo_enlazado"; columnaEnlaceKey: string; columnaObjetivoKey: string; delta: number };

export interface Regla {
  id: string;
  activa: boolean;
  // "automatica" = la creó el sistema (enlace de stock, sugerencia de plantilla) -- informativo
  // para la UI (ver ReglasModulo), no cambia en nada cómo se evalúa.
  origen: "automatica" | "manual";
  condicion: Condicion;
  accion: Accion;
}

export function condicionCumple(condicion: Condicion, datos: Record<string, unknown>): boolean {
  if (condicion.tipo === "siempre") return true;
  if (condicion.tipo === "estado") return String(datos[condicion.columnaKey] ?? "").trim() === condicion.valor;

  const crudo = datos[condicion.columnaKey];
  if (condicion.operador === "es") return String(crudo ?? "").trim() === condicion.valor;
  if (condicion.operador === "no_es") return String(crudo ?? "").trim() !== condicion.valor;

  // Resto de operadores son numéricos (mayor/menor): si cualquiera de los 2
  // lados no es un número real, la condición simplemente no matchea -- nunca
  // un error, un campo de texto con un operador numérico solo no dispara.
  const num = Number(crudo);
  const umbral = Number(condicion.valor);
  if (!Number.isFinite(num) || !Number.isFinite(umbral)) return false;
  if (condicion.operador === "mayor") return num > umbral;
  if (condicion.operador === "mayor_igual") return num >= umbral;
  if (condicion.operador === "menor") return num < umbral;
  return num <= umbral; // menor_igual
}
