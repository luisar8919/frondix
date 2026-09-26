// Lógica del seguimiento de clientes: a quién escribirle y qué decirle.
// Todo son funciones puras (sin base de datos ni reloj propio) para poder probarlas.

const MS_DIA = 86400000;
const OFFSET_LIMA_MS = -5 * 3600 * 1000; // Perú no tiene horario de verano

export function normalizarTexto(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

// Medianoche UTC de la fecha ("2026-01-28" o "2026-01-28T00:00:00.000Z"); null si no es una fecha.
export function fechaUTC(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(t) ? null : t;
}

function hoyLima(ahora: Date): number {
  const l = new Date(ahora.getTime() + OFFSET_LIMA_MS);
  return Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate());
}

// Días enteros entre una fecha y hoy (hora de Lima). Negativo si la fecha es futura.
export function diasDesde(iso: unknown, ahora: Date): number | null {
  const t = fechaUTC(iso);
  return t === null ? null : Math.round((hoyLima(ahora) - t) / MS_DIA);
}

export interface FilaCruda {
  c?: string | null; // cliente
  f?: string | null; // fecha
  t?: string | null; // teléfono
  m?: string | number | null; // monto
}

export interface ClienteResumen {
  clave: string;
  nombre: string;
  ultimaFecha: string; // YYYY-MM-DD
  visitas: number;
  telefono: string | null;
}

// Espacios de más fuera; y si viene TODO en minúsculas o TODO en mayúsculas, formato de nombre propio.
export function formatearNombre(n: string): string {
  const limpio = n.trim().replace(/\s+/g, " ");
  if (limpio !== limpio.toLowerCase() && limpio !== limpio.toUpperCase()) return limpio;
  return limpio.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, e, l) => e + l.toUpperCase());
}

// Una fila por cliente: última fecha, cuántas veces aparece y su teléfono más reciente.
export function agruparClientes(filas: FilaCruda[]): ClienteResumen[] {
  const mapa = new Map<string, { nombre: string; ultimaMs: number; visitas: number; telefono: string | null; telMs: number }>();
  for (const fila of filas) {
    const original = fila.c?.toString().trim();
    const nombre = original ? formatearNombre(original) : undefined;
    const ms = fechaUTC(fila.f);
    if (!nombre || ms === null) continue;

    const clave = normalizarTexto(nombre);
    const actual = mapa.get(clave) ?? { nombre, ultimaMs: -Infinity, visitas: 0, telefono: null, telMs: -Infinity };
    actual.visitas++;
    if (ms > actual.ultimaMs) {
      actual.ultimaMs = ms;
      actual.nombre = nombre;
    }
    const tel = fila.t?.toString().trim();
    if (tel && ms >= actual.telMs) {
      actual.telefono = tel;
      actual.telMs = ms;
    }
    mapa.set(clave, actual);
  }
  return [...mapa.entries()].map(([clave, v]) => ({
    clave,
    nombre: v.nombre,
    ultimaFecha: new Date(v.ultimaMs).toISOString().slice(0, 10),
    visitas: v.visitas,
    telefono: v.telefono,
  }));
}

export interface ClienteSinVolver extends ClienteResumen {
  dias: number;
}

// Clientes cuya última fecha es de hace `umbral` días o más, los más antiguos primero.
export function sinVolver(clientes: ClienteResumen[], umbral: number, ahora: Date): ClienteSinVolver[] {
  return clientes
    .map((c) => ({ ...c, dias: diasDesde(c.ultimaFecha, ahora) ?? -1 }))
    .filter((c) => c.dias >= umbral)
    .sort((a, b) => b.dias - a.dias || a.nombre.localeCompare(b.nombre, "es"));
}

export interface ResumenSemana {
  actual: number;
  anterior: number;
  registrosActual: number;
  registrosAnterior: number;
  variacion: number | null; // % respecto a la semana anterior; null si antes no hubo ventas
}

function aNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Suma de montos de los últimos 7 días (hoy incluido) contra los 7 días anteriores.
export function resumenSemana(filas: FilaCruda[], ahora: Date): ResumenSemana {
  const r = { actual: 0, anterior: 0, registrosActual: 0, registrosAnterior: 0 };
  for (const fila of filas) {
    const d = diasDesde(fila.f, ahora);
    const monto = aNumero(fila.m);
    if (d === null || monto === null || d < 0) continue;
    if (d <= 6) { r.actual += monto; r.registrosActual++; }
    else if (d <= 13) { r.anterior += monto; r.registrosAnterior++; }
  }
  const variacion = r.anterior > 0 ? ((r.actual - r.anterior) / r.anterior) * 100 : null;
  return { ...r, actual: redondear(r.actual), anterior: redondear(r.anterior), variacion };
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// Número de celular peruano listo para WhatsApp (51 + 9 dígitos), o null si no sirve.
export function normalizarTelefonoPE(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const digitos = String(raw).replace(/\D/g, "");
  if (digitos.length === 9 && digitos.startsWith("9")) return "51" + digitos;
  if (digitos.length === 11 && digitos.startsWith("519")) return digitos;
  return null;
}

export const PLANTILLA_POR_DEFECTO =
  "Hola {nombre}, soy de {negocio}. Hace {dias} días que no te vemos por aquí y quería saber cómo te fue. ¿Te ayudamos con algo?";

export function primerNombre(nombreCompleto: string): string {
  const p = nombreCompleto.trim().split(/\s+/)[0] ?? "";
  return p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : "";
}

export function armarMensaje(plantilla: string, datos: { nombre: string; negocio: string; dias: number }): string {
  return plantilla
    .split("{nombre}").join(primerNombre(datos.nombre))
    .split("{negocio}").join(datos.negocio)
    .split("{dias}").join(String(datos.dias));
}

// Abre WhatsApp con el mensaje ya escrito: el dueño solo lo revisa y toca enviar.
export function enlaceWhatsApp(telefonoNormalizado: string, mensaje: string): string {
  return `https://wa.me/${telefonoNormalizado}?text=${encodeURIComponent(mensaje)}`;
}
