// Cambios de estructura de una tabla (agregar, quitar y renombrar campos) y sus avisos.
// Funciones puras para poder probarlas sin base de datos.
import type { Columna, TipoColumna } from "./excel-parser.ts";
import type { RolColumna } from "./roles.ts";
import { relacionesEntrantes, type DatasetResumen } from "./enlaces.ts";

export interface ColumnaPropuesta {
  key?: string; // sin key = campo nuevo
  label: string;
  tipo: TipoColumna; // solo cuenta en campos nuevos: cambiar el tipo de uno existente no se permite
  rol: RolColumna | null;
}

export function nuevaClave(label: string, usadas: Set<string>): string {
  const base =
    label.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) ||
    "campo";
  let clave = base;
  for (let i = 2; usadas.has(clave); i++) clave = `${base}_${i}`;
  usadas.add(clave);
  return clave;
}

export interface PlanEstructura {
  columnas: Columna[];
  eliminadas: string[];
  // enlaces de OTRAS tablas que apuntaban a una columna que se quita
  enlacesARomper: { datasetId: string; columnaKey: string }[];
  advertencias: string[];
}

export function planificarCambios(
  actuales: Columna[],
  propuestas: ColumnaPropuesta[],
  nombreTabla: string,
  datasetId: string,
  otras: DatasetResumen[]
): PlanEstructura | { error: string } {
  if (propuestas.length === 0) return { error: "La tabla necesita al menos un campo." };
  if (propuestas.length > 60) return { error: "Una tabla admite hasta 60 campos." };

  const porClave = new Map(actuales.map((c) => [c.key, c]));
  const usadas = new Set(actuales.map((c) => c.key));
  const conservadas = new Set<string>();
  const columnas: Columna[] = [];

  for (const p of propuestas) {
    const label = String(p.label ?? "").trim();
    if (!label) return { error: "Todos los campos necesitan un nombre." };
    if (label.length > 60) return { error: `El nombre "${label.slice(0, 20)}..." es demasiado largo (máximo 60 letras).` };
    const existente = p.key ? porClave.get(p.key) : undefined;
    if (p.key && !existente) return { error: `El campo "${p.key}" no existe en esta tabla.` };
    if (existente) {
      if (conservadas.has(existente.key)) return { error: "Un campo aparece repetido." };
      conservadas.add(existente.key);
      columnas.push({ ...existente, label, rol: p.rol ?? null });
    } else {
      if (!["texto", "numero", "fecha"].includes(p.tipo)) return { error: `Tipo de campo no válido en "${label}".` };
      columnas.push({ key: nuevaClave(label, usadas), label, tipo: p.tipo, rol: p.rol ?? null, sospechosa: false });
    }
  }

  const labels = columnas.map((c) => c.label.toLowerCase());
  const repetido = labels.find((l, i) => labels.indexOf(l) !== i);
  if (repetido) return { error: `Hay dos campos llamados "${repetido}".` };

  const eliminadas = actuales.filter((c) => !conservadas.has(c.key)).map((c) => c.key);
  const advertencias: string[] = [];
  const enlacesARomper: PlanEstructura["enlacesARomper"] = [];

  for (const key of eliminadas) {
    const col = porClave.get(key)!;
    advertencias.push(`Se borrarán el campo "${col.label}" y todos sus datos. No se puede deshacer.`);
    for (const rel of relacionesEntrantes(otras, datasetId).filter((r) => r.miColumnaKey === key)) {
      const colOtra = otras.find((d) => d.id === rel.datasetId)?.columnas.find((c) => c.key === rel.columnaKey);
      advertencias.push(
        `"${col.label}" está enlazado desde el campo "${colOtra?.label ?? rel.columnaKey}" de la tabla "${rel.nombre}". Ese enlace se quitará (los datos de esa tabla se conservan).`
      );
      enlacesARomper.push({ datasetId: rel.datasetId, columnaKey: rel.columnaKey });
    }
  }

  return { columnas, eliminadas, enlacesARomper, advertencias };
}

export function planEliminarTabla(datasetId: string, nombre: string, otras: DatasetResumen[]) {
  const entrantes = relacionesEntrantes(otras, datasetId);
  const advertencias = [`Se borrará la tabla "${nombre}" con todos sus registros. No se puede deshacer.`];
  for (const rel of entrantes) {
    const col = otras.find((d) => d.id === rel.datasetId)?.columnas.find((c) => c.key === rel.columnaKey);
    advertencias.push(
      `La tabla "${rel.nombre}" tiene su campo "${col?.label ?? rel.columnaKey}" enlazado con esta. Ese enlace se quitará (los datos de "${rel.nombre}" se conservan).`
    );
  }
  return {
    advertencias,
    enlacesARomper: entrantes.map((r) => ({ datasetId: r.datasetId, columnaKey: r.columnaKey })),
  };
}
