"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import DynamicTable from "@/components/DynamicTable";
import DynamicForm from "@/components/DynamicForm";
import EnlacesTabla from "@/components/EnlacesTabla";
import type { Columna } from "@/lib/excel-parser";
import { filtrarRegistros } from "@/lib/buscar";
import { filtrarPorColumna, relacionesEntrantes, type DatasetResumen } from "@/lib/enlaces";

interface Registro {
  id: string;
  data: Record<string, unknown>;
}

// Se traen por tramos de 1000 (el máximo que devuelve Supabase por consulta) hasta este
// tope. Con más filas que esto la búsqueda en pantalla dejaría de ser cómoda.
const PAGINA = 1000;
const TOPE_CARGA = 20000;

export default function DatasetPage({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{ filtrarCol?: string; filtrarVal?: string }>;
}) {
  const { datasetId } = usePromise(params);
  const { filtrarCol, filtrarVal } = usePromise(searchParams);

  const [dataset, setDataset] = useState<{ id: string; nombre: string; columnas: Columna[] } | null>(null);
  const [otras, setOtras] = useState<DatasetResumen[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [opciones, setOpciones] = useState<Record<string, string[]>>({});
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  async function cargar() {
    let acumulados: Registro[] = [];
    let totalTabla = 0;
    for (let desde = 0; desde < TOPE_CARGA; desde += PAGINA) {
      const res = await fetch(`/api/records/${datasetId}?desde=${desde}&limite=${PAGINA}`);
      if (!res.ok) return setError(true);
      const body = await res.json();
      if (desde === 0) {
        setDataset(body.dataset);
        setOtras(body.otras ?? []);
        cargarOpciones(body.dataset.columnas);
      }
      totalTabla = body.total;
      acumulados = acumulados.concat(body.records);
      setRegistros(acumulados);
      setTotal(totalTabla);
      if (acumulados.length >= totalTabla || body.records.length < PAGINA) break;
    }
    setCargando(false);
  }

  // Lista de valores permitidos para cada columna enlazada (alimenta el autocompletado).
  async function cargarOpciones(columnas: Columna[]) {
    const entradas = await Promise.all(
      columnas
        .filter((c) => c.enlace)
        .map(async (c) => {
          const res = await fetch(`/api/records/${c.enlace!.datasetId}/valores?columna=${c.enlace!.columnaKey}`);
          return [c.key, res.ok ? ((await res.json()).valores as string[]) : []] as const;
        })
    );
    setOpciones(Object.fromEntries(entradas));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  if (error) {
    return (
      <div className="tarjeta vacio">
        <h2 style={{ fontSize: 24 }}>No pudimos abrir esta tabla</h2>
        <p>Puede que no exista o que no tengas acceso.</p>
        <Link href="/dashboard" className="btn btn-primario">Volver a mis tablas</Link>
      </div>
    );
  }
  if (!dataset) return <p className="suave" role="status">Cargando tu tabla...</p>;

  async function agregarRegistro(valores: Record<string, unknown>): Promise<string | null> {
    const res = await fetch(`/api/records/${datasetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valores),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? "No se pudo guardar el registro";
    // Se suma el registro nuevo en pantalla: recargar toda la tabla por cada alta
    // gastaría transferencia (el plan gratis de Supabase da 5 GB al mes).
    setRegistros((anteriores) => [body.record, ...anteriores]);
    setTotal((t) => t + 1);
    return null;
  }

  const etiquetasEnlace = Object.fromEntries(
    dataset.columnas
      .filter((c) => c.enlace)
      .map((c) => {
        const destino = otras.find((d) => d.id === c.enlace!.datasetId);
        const col = destino?.columnas.find((x) => x.key === c.enlace!.columnaKey);
        return [c.key, destino ? `${destino.nombre} > ${col?.label ?? c.enlace!.columnaKey}` : "otra tabla"];
      })
  );

  const filtradas = filtrarPorColumna(registros, filtrarCol, filtrarVal);
  const registrosFiltrados = filtrarRegistros(filtradas, busqueda);
  const colFiltro = dataset.columnas.find((c) => c.key === filtrarCol);
  const incompleta = total > registros.length;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <Link href="/dashboard" className="migas">&larr; Mis tablas</Link>
          <h1>{dataset.nombre}</h1>
          <p className="suave">
            {total.toLocaleString("es-PE")} {total === 1 ? "registro" : "registros"}
            {cargando && registros.length < total ? ` (cargando ${registros.length.toLocaleString("es-PE")}...)` : ""}
          </p>
        </div>
      </div>

      {incompleta && !cargando && (
        <p className="alerta alerta-aviso">
          Esta tabla tiene {total.toLocaleString("es-PE")} registros y aquí se muestran los primeros{" "}
          {registros.length.toLocaleString("es-PE")} (los más recientes). La búsqueda solo mira esos.
        </p>
      )}

      <details className="tarjeta plegable" open>
        <summary>Agregar un registro</summary>
        <div className="plegable-cuerpo">
          <DynamicForm
            columnas={dataset.columnas}
            opciones={opciones}
            etiquetasEnlace={etiquetasEnlace}
            onSubmit={agregarRegistro}
          />
        </div>
      </details>

      <EnlacesTabla datasetId={datasetId} columnas={dataset.columnas} otras={otras} onGuardado={cargar} />

      {filtrarCol && filtrarVal !== undefined && (
        <p className="alerta alerta-ok">
          Mostrando solo: <strong>{colFiltro?.label ?? filtrarCol}</strong> = <strong>{filtrarVal}</strong>{" "}
          <Link href={`/dashboard/${datasetId}`}>Quitar filtro</Link>
        </p>
      )}

      <div className="buscador">
        <label htmlFor="buscar" className="solo-lectores">Buscar en la tabla</label>
        <input
          id="buscar"
          type="search"
          placeholder="Buscar por cualquier dato..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <span className="suave pequeno" aria-live="polite">
          {registrosFiltrados.length.toLocaleString("es-PE")} de {registros.length.toLocaleString("es-PE")}
        </span>
      </div>

      <DynamicTable
        columnas={dataset.columnas}
        registros={registrosFiltrados}
        relacionadas={relacionesEntrantes(otras, datasetId)}
      />
    </>
  );
}
