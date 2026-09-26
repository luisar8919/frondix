import * as XLSX from "xlsx";
import { sugerirRoles, type RolColumna } from "./roles.ts";

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
}

export interface OpcionesParseo {
  // undefined = detectarlo solo; true/false = decisión del usuario
  sinEncabezado?: boolean;
}

function aKey(label: string, usados: Set<string>): string {
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

function inferirTipo(valores: unknown[]): TipoColumna {
  const conValor = valores.filter((v) => v !== null && v !== undefined && v !== "");
  if (conValor.length === 0) return "texto";
  const todosFecha = conValor.every((v) => v instanceof Date);
  if (todosFecha) return "fecha";
  const todosNumero = conValor.every((v) => typeof v === "number");
  if (todosNumero) return "numero";
  return "texto";
}

// Un Excel real de negocio suele tener varias hojas (meses, caja, stock, etc.) —
// nunca asumir que la primera hoja es "todo el archivo". Listamos para que el
// usuario elija cuál importar como tabla.
export function listarHojas(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array", bookSheets: true });
  return workbook.SheetNames;
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
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
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
      const key = aKey(label, usados);
      return {
        key,
        label: renombres?.[key] ?? label,
        tipo: inferirTipo(valoresColumna),
        sospechosa: pareceValorDeDato(filaEncabezados[idxOriginal]),
        idxOriginal,
      };
    }
  );

  // Una sola columna detectada es otra señal de alarma común (listas sin
  // encabezado, como vimos en la hoja "Stock" real): no hay con qué comparar,
  // pero vale la pena que el usuario la confirme igual. Si los nombres los
  // inventamos nosotros (sin encabezado), también se piden confirmar.
  if (columnas.length === 1 || sinEncabezado) columnas.forEach((c) => (c.sospechosa = true));

  const filas = filasDatos
    .filter((fila) => fila.some((v) => v !== null && v !== undefined && v !== ""))
    .map((fila) => {
      const registro: Record<string, unknown> = {};
      columnas.forEach((col) => {
        registro[col.key] = fila[col.idxOriginal] ?? null;
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
  };
}

export interface GrupoHojas {
  hojas: string[];
  columnas: Columna[];
  filas: Record<string, unknown>[];
}

interface HojaParseada {
  nombre: string;
  columnas: Columna[];
  filas: Record<string, unknown>[];
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

// Agrupa las hojas del archivo por estructura parecida y arma hasta `maxGrupos`
// tablas, cada una usando como esquema el de la hoja con más columnas del grupo
// (las hojas del grupo con menos columnas completan esos campos como null).
export function agruparHojas(
  buffer: ArrayBuffer,
  maxGrupos = 3
): { grupos: GrupoHojas[]; hojasOmitidas: string[] } {
  const nombres = listarHojas(buffer);

  const hojas: HojaParseada[] = [];
  for (const nombre of nombres) {
    try {
      const { columnas, filas } = parsearExcel(buffer, nombre);
      if (columnas.length > 0 && filas.length > 0) hojas.push({ nombre, columnas, filas });
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
    const grupo = grupos.find((g) => mismaFamilia(keysHoja, new Set(g[0].columnas.map((c) => c.key))));
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
  const hojasOmitidas = grupos.slice(maxGrupos).flatMap((g) => g.map((h) => h.nombre));

  const resultado: GrupoHojas[] = gruposFinales.map((grupo) => {
    const canonica = grupo[0]; // la de más columnas, por el sort de arriba
    const filas = grupo.flatMap((hoja) =>
      hoja.filas.map((fila) => {
        const registro: Record<string, unknown> = {};
        canonica.columnas.forEach((c) => (registro[c.key] = fila[c.key] ?? null));
        return registro;
      })
    );
    return { hojas: grupo.map((h) => h.nombre), columnas: canonica.columnas, filas };
  });

  return { grupos: resultado, hojasOmitidas };
}
