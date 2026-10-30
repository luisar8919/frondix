import * as XLSX from "xlsx";
import { sugerirRoles, tipoModulo, type RolColumna } from "./roles.ts";

export type TipoColumna = "texto" | "numero" | "fecha";

export interface Columna {
  key: string;
  label: string;
  tipo: TipoColumna;
  // qué significa la columna para el negocio (monto, fecha, cliente...); null si no aplica
  rol: RolColumna | null;
  // true cuando conviene que el usuario confirme el nombre antes de importar
  // (ver `pareceValorDeDato` y el caso "una sola columna" más abajo).
  sospechosa: boolean;
  // enlace a otra tabla: los valores de esta columna deben existir en esa otra columna
  enlace?: EnlaceColumna | null;
}

export interface EnlaceColumna {
  datasetId: string;
  columnaKey: string;
}

export interface ExcelParseado {
  columnas: Columna[];
  filas: Record<string, unknown>[];
  // true si la primera fila se trató como dato (la hoja no tenía encabezado)
  sinEncabezado: boolean;
  // filas que se descartaron por venir completamente vacías (para avisarle al usuario)
  filasVaciasDescartadas: number;
}

export interface OpcionesParseo {
  // undefined = detectarlo solo; true/false = decisión del usuario
  sinEncabezado?: boolean;
}

export function aKey(label: string, usados: Set<string>): string {
  let key = label
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca tildes
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!key) key = "columna";
  let final = key;
  let i = 2;
  while (usados.has(final)) {
    final = `${key}_${i}`;
    i++;
  }
  usados.add(final);
  return final;
}

// No se puede saber el nombre "correcto" de una columna solo mirando los datos —
// pero sí se puede detectar cuando la celda de título en realidad es un dato
// (un número o una fecha), que es la señal más confiable de que esa fila no es
// un encabezado real. Eso lo marcamos como sospechoso y lo dejamos a criterio
// del usuario, en vez de adivinar un nombre que puede estar mal.
function pareceValorDeDato(v: unknown): boolean {
  return typeof v === "number" || v instanceof Date;
}

const hayValor = (v: unknown) => v !== null && v !== undefined && v !== "";

// Dos casos donde la primera fila casi seguro NO es un encabezado:
// - la mayoría de sus celdas son números o fechas (son datos, no títulos);
// - la hoja es una lista de una sola columna (ej. "Stock" con solo productos).
// Si se equivoca, el usuario lo corrige con la opción de la pantalla de importación;
// perder en silencio la primera fila es peor que mostrarla de más.
function pareceSinEncabezado(primeraFila: unknown[], columnasConDatos: number): boolean {
  if (columnasConDatos === 1) return true;
  const celdas = primeraFila.filter(hayValor);
  return celdas.length > 0 && celdas.filter(pareceValorDeDato).length / celdas.length > 0.5;
}

// Meses en español (con y sin tilde, abreviado o completo) para fechas
// escritas a mano como texto -- "set" además de "sep" porque es como mucha
// gente en Perú abrevia setiembre.
const MESES_ES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8,
  set: 9, sep: 9, oct: 10, nov: 11, dic: 12,
};

function fechaValida(anio: number, mes1a12: number, dia: number): Date | null {
  if (mes1a12 < 1 || mes1a12 > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(anio, mes1a12 - 1, dia));
  // new Date se "desborda" (32 de enero -> 1 de febrero) en vez de fallar --
  // se revisa que el resultado tenga el mes que se pidió.
  if (d.getUTCMonth() !== mes1a12 - 1 || d.getUTCDate() !== dia) return null;
  return d;
}

// Entiende los formatos de fecha-como-texto más comunes en un Excel real de
// LatAm (ISO, dd/mm/aaaa con "/" o "-", y fecha en palabras tipo "9 sept
// 2026" o "9 de setiembre del 2026"). Devuelve null si no reconoce nada --
// ese valor se deja tal cual y la columna queda marcada sospechosa.
function parsearFechaTexto(v: string): Date | null {
  const s = v.trim().toLowerCase();

  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return fechaValida(+m[1], +m[2], +m[3]);

  // dd/mm/aaaa o dd-mm-aaaa -- convención LatAm (día primero), no mm/dd.
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return fechaValida(+m[3], +m[2], +m[1]);

  m = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/^(\d{1,2})\s*(?:de\s*)?([a-z]+)\.?\s*(?:de\s*|del\s*)?(\d{4})$/);
  if (m) {
    const mes = MESES_ES[m[2].slice(0, 3)];
    if (mes) return fechaValida(+m[3], mes, +m[1]);
  }

  return null;
}

function parsearFecha(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" && v.trim() !== "") return parsearFechaTexto(v);
  return null;
}

function formatearFechaISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

// Por mayoría, no por unanimidad: un Excel real tiene errores de tipeo (un
// "no especifica" suelto en una columna de montos, una fecha escrita a mano
// con otro formato entre puras fechas reales). Exigir el 100% hacía que una
// sola celda mal escrita le quitara el tipo -- y con él el rol (sugerirRoles
// exige que el tipo calce) -- a la columna ENTERA, aunque el resto fuera
// consistente. Para fecha, cuenta tanto el Date real de Excel como el texto
// que logramos interpretar como fecha (distintos formatos mezclados en la
// misma columna, el caso más común en un Excel armado a mano).
function inferirTipo(valores: unknown[]): TipoColumna {
  const conValor = valores.filter((v) => v !== null && v !== undefined && v !== "");
  if (conValor.length === 0) return "texto";
  const fechas = conValor.filter((v) => parsearFecha(v) !== null).length;
  if (fechas / conValor.length > 0.5) return "fecha";
  const numeros = conValor.filter((v) => typeof v === "number").length;
  if (numeros / conValor.length > 0.5) return "numero";
  return "texto";
}

// Si el tipo se decidió por mayoría, las celdas que no calzan con ese tipo
// quedan tal cual (texto suelto en una columna "numero", por ejemplo) -- se
// marca la columna como sospechosa para que el usuario las note y las revise
// antes de confiar en los reportes/validaciones que dependen de ese tipo.
function tieneValoresFueraDeTipo(valores: unknown[], tipo: TipoColumna): boolean {
  if (tipo === "texto") return false;
  const conValor = valores.filter((v) => v !== null && v !== undefined && v !== "");
  return conValor.some((v) => (tipo === "fecha" ? parsearFecha(v) === null : typeof v !== "number"));
}

// Un Excel real de negocio suele tener varias hojas (meses, caja, stock, etc.) —
// nunca asumir que la primera hoja es "todo el archivo". Listamos para que el
// usuario elija cuál importar como tabla.
export function listarHojas(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array", bookSheets: true });
  return workbook.SheetNames;
}

// Límites defensivos: un Excel real puede traer decenas de hojas (reportes pivot,
// una hoja por cliente, etc.) que no sirven para importar como tabla. Sin esto,
// un archivo de ~80 hojas / ~50MB puede tardar varios minutos y superar el
// tiempo de espera del servidor. Se valida antes de parsear, no después.
export const TOPE_TAMANO_BYTES = 20 * 1024 * 1024; // 20MB
export const TOPE_HOJAS = 60;

function validarTamano(buffer: ArrayBuffer) {
  if (buffer.byteLength > TOPE_TAMANO_BYTES) {
    const mb = (buffer.byteLength / 1024 / 1024).toFixed(1);
    throw new Error(
      `El archivo pesa ${mb}MB y el máximo soportado es ${TOPE_TAMANO_BYTES / 1024 / 1024}MB. Divide la información en varios archivos más chicos.`
    );
  }
}

// Toma la hoja indicada (o la primera si no se especifica), usa la primera fila
// como encabezados, e infiere el tipo de cada columna mirando los datos reales.
// `renombres` (key -> nuevo label) permite pisar el nombre de columnas que el
// usuario ya revisó y corrigió en el paso de confirmación de la UI.
export function parsearExcel(
  buffer: ArrayBuffer,
  nombreHoja?: string,
  renombres?: Record<string, string>,
  opciones?: OpcionesParseo
): ExcelParseado {
  validarTamano(buffer);
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return parsearHojaDeWorkbook(workbook, nombreHoja, renombres, opciones);
}

// Misma lógica de arriba, pero reutilizando un workbook ya leído: leer el buffer
// una vez por hoja (como hacía antes agruparHojas, llamando a parsearExcel en un
// for) era la causa real de que archivos con muchas hojas tardaran minutos —
// cada llamada releía el archivo completo desde cero.
function parsearHojaDeWorkbook(
  workbook: XLSX.WorkBook,
  nombreHoja?: string,
  renombres?: Record<string, string>,
  opciones?: OpcionesParseo
): ExcelParseado {
  const hojaElegida = nombreHoja ?? workbook.SheetNames[0];
  const hoja = workbook.Sheets[hojaElegida];
  if (!hoja) throw new Error(`No se encontró la hoja "${hojaElegida}" en el archivo.`);

  const filasCrudas: unknown[][] = XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  if (filasCrudas.length === 0) {
    throw new Error("El archivo está vacío.");
  }

  const columnasConDatos = new Set<number>();
  filasCrudas.forEach((fila) => fila.forEach((v, i) => hayValor(v) && columnasConDatos.add(i)));

  const sinEncabezado =
    opciones?.sinEncabezado ?? pareceSinEncabezado(filasCrudas[0], columnasConDatos.size);

  // Sin encabezado: todas las filas son datos y las columnas se nombran solas
  // (una lista de una columna toma el nombre de la hoja; si no, "Columna N").
  const ancho = Math.max(...filasCrudas.map((f) => f.length));
  const filaEncabezados: unknown[] = sinEncabezado
    ? Array.from({ length: ancho }, (_, i) =>
        !columnasConDatos.has(i) ? "" : columnasConDatos.size === 1 ? hojaElegida : `Columna ${i + 1}`
      )
    : filasCrudas[0];
  const encabezados = filaEncabezados.map((h) => (h === null ? "" : String(h)));
  const filasDatos = sinEncabezado ? filasCrudas : filasCrudas.slice(1);

  const usados = new Set<string>();
  const columnasConIndice = encabezados
    .map((label, idxOriginal) => ({ label: label.trim(), idxOriginal }))
    .filter((c) => c.label !== ""); // ignora columnas sin encabezado

  const columnas: (Omit<Columna, "rol"> & { idxOriginal: number })[] = columnasConIndice.map(
    ({ label, idxOriginal }) => {
      const valoresColumna = filasDatos.map((fila) => fila[idxOriginal]);
      const tipo = inferirTipo(valoresColumna);
      const key = aKey(label, usados);
      return {
        key,
        label: renombres?.[key] ?? label,
        tipo,
        sospechosa: pareceValorDeDato(filaEncabezados[idxOriginal]) || tieneValoresFueraDeTipo(valoresColumna, tipo),
        idxOriginal,
      };
    }
  );

  // Una sola columna detectada es otra señal de alarma común (listas sin
  // encabezado, como vimos en la hoja "Stock" real): no hay con qué comparar,
  // pero vale la pena que el usuario la confirme igual. Si los nombres los
  // inventamos nosotros (sin encabezado), también se piden confirmar.
  if (columnas.length === 1 || sinEncabezado) columnas.forEach((c) => (c.sospechosa = true));

  const filasNoVacias = filasDatos.filter((fila) => fila.some((v) => v !== null && v !== undefined && v !== ""));
  const filasVaciasDescartadas = filasDatos.length - filasNoVacias.length;
  const filas = filasNoVacias
    .map((fila) => {
      const registro: Record<string, unknown> = {};
      columnas.forEach((col) => {
        const v = fila[col.idxOriginal] ?? null;
        // Columna "fecha": se estandariza cada valor interpretable (Date real
        // o texto en cualquiera de los formatos reconocidos) a yyyy-mm-dd --
        // el formato que ya espera toda la app (ver DynamicForm/DynamicTable,
        // <input type="date">). El valor que no se pudo interpretar se deja
        // tal cual (la columna ya quedó marcada sospechosa para revisarlo).
        if (col.tipo === "fecha" && v !== null) {
          const fecha = parsearFecha(v);
          registro[col.key] = fecha ? formatearFechaISO(fecha) : v;
        } else if (typeof v === "string") {
          // Un espacio de más (tipeado a mano en el Excel) rompe la comparación
          // exacta de los enlaces entre tablas (ver validarEnlaces en dependientes.ts).
          registro[col.key] = v.trim();
        } else {
          registro[col.key] = v;
        }
      });
      return registro;
    });

  const roles = sugerirRoles(columnas);

  return {
    columnas: columnas.map(({ key, label, tipo, sospechosa }) => ({
      key,
      label,
      tipo,
      sospechosa,
      rol: roles[key] ?? null,
    })),
    filas,
    sinEncabezado,
    filasVaciasDescartadas,
  };
}

export interface GrupoHojas {
  hojas: string[];
  columnas: Columna[];
  filas: Record<string, unknown>[];
  filasVaciasDescartadas: number;
}

interface HojaParseada {
  nombre: string;
  columnas: Columna[];
  filas: Record<string, unknown>[];
  filasVaciasDescartadas: number;
}

// Dos hojas son "la misma estructura" si casi todas las columnas de la más
// chica están en la más grande (no exige que sean idénticas: acepta que una
// tenga más columnas que la otra, que es justo el caso real de "Noviembre"
// con 5 columnas vs "Diciembre" con 8, mismo tipo de tabla).
function mismaFamilia(a: Set<string>, b: Set<string>): boolean {
  const chica = a.size <= b.size ? a : b;
  const grande = a.size <= b.size ? b : a;
  if (chica.size === 0) return false;
  let comunes = 0;
  for (const key of chica) if (grande.has(key)) comunes++;
  return comunes / chica.size >= 0.7;
}

// Una hoja de Ventas (columna Cliente) y una de Compras (columna Proveedor)
// pueden compartir Fecha/Producto/Monto y pasar el 70% de mismaFamilia -- pero
// mezclarlas en una sola tabla es justo lo que no se quiere (dificulta
// sustentar cada una por separado). Se cortan acá, antes de agrupar, aunque
// el resto de columnas coincida.
function tiposIncompatibles(a: Columna[], nombreA: string, b: Columna[], nombreB: string): boolean {
  const tipoA = tipoModulo(a.map((c) => c.rol), nombreA);
  const tipoB = tipoModulo(b.map((c) => c.rol), nombreB);
  return tipoA !== "otro" && tipoB !== "otro" && tipoA !== tipoB;
}

// Agrupa las hojas del archivo por estructura parecida y arma hasta `maxGrupos`
// tablas, cada una usando como esquema el de la hoja con más columnas del grupo
// (las hojas del grupo con menos columnas completan esos campos como null).
export function agruparHojas(
  buffer: ArrayBuffer,
  maxGrupos = 3
): { grupos: GrupoHojas[]; hojasOmitidas: string[] } {
  validarTamano(buffer);
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const nombres = workbook.SheetNames;
  // Si son muchísimas hojas (ej. una por cliente), procesamos solo las primeras
  // TOPE_HOJAS y avisamos el resto como omitidas, en vez de tardar minutos.
  const nombresAProcesar = nombres.slice(0, TOPE_HOJAS);
  const hojasIgnoradasPorTope = nombres.slice(TOPE_HOJAS);

  const hojas: HojaParseada[] = [];
  for (const nombre of nombresAProcesar) {
    try {
      const { columnas, filas, filasVaciasDescartadas } = parsearHojaDeWorkbook(workbook, nombre);
      if (columnas.length > 0 && filas.length > 0) hojas.push({ nombre, columnas, filas, filasVaciasDescartadas });
    } catch {
      // hoja vacía o ilegible: se ignora, no rompe el resto del archivo
    }
  }

  // ordenamos por cantidad de columnas descendente: así, el primer miembro
  // que arma cada grupo es siempre el de más columnas de ese grupo.
  hojas.sort((a, b) => b.columnas.length - a.columnas.length);

  const grupos: HojaParseada[][] = [];
  for (const hoja of hojas) {
    const keysHoja = new Set(hoja.columnas.map((c) => c.key));
    const grupo = grupos.find(
      (g) => mismaFamilia(keysHoja, new Set(g[0].columnas.map((c) => c.key))) && !tiposIncompatibles(hoja.columnas, hoja.nombre, g[0].columnas, g[0].nombre)
    );
    if (grupo) grupo.push(hoja);
    else grupos.push([hoja]);
  }

  // si hay más de `maxGrupos` familias distintas, priorizamos las que tienen más datos
  grupos.sort((a, b) => {
    const filasA = a.reduce((sum, h) => sum + h.filas.length, 0);
    const filasB = b.reduce((sum, h) => sum + h.filas.length, 0);
    return filasB - filasA;
  });

  const gruposFinales = grupos.slice(0, maxGrupos);
  const hojasOmitidas = [
    ...grupos.slice(maxGrupos).flatMap((g) => g.map((h) => h.nombre)),
    ...hojasIgnoradasPorTope,
  ];

  const resultado: GrupoHojas[] = gruposFinales.map((grupo) => {
    const canonica = grupo[0]; // la de más columnas, por el sort de arriba
    const filas = grupo.flatMap((hoja) =>
      hoja.filas.map((fila) => {
        const registro: Record<string, unknown> = {};
        canonica.columnas.forEach((c) => (registro[c.key] = fila[c.key] ?? null));
        return registro;
      })
    );
    return {
      hojas: grupo.map((h) => h.nombre),
      columnas: canonica.columnas,
      filas,
      filasVaciasDescartadas: grupo.reduce((s, h) => s + h.filasVaciasDescartadas, 0),
    };
  });

  return { grupos: resultado, hojasOmitidas };
}
