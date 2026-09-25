"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import DynamicTable from "@/components/DynamicTable";
import DynamicForm from "@/components/DynamicForm";
import type { Columna } from "@/lib/excel-parser";
import { filtrarRegistros } from "@/lib/buscar";

interface DatasetData {
  dataset: { id: string; nombre: string; columnas: Columna[] };
  records: { id: string; data: Record<string, unknown> }[];
}

export default function DatasetPage({ params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = usePromise(params);
  const [data, setData] = useState<DatasetData | null>(null);
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  async function cargar() {
    const res = await fetch(`/api/records/${datasetId}`);
    if (res.ok) setData(await res.json());
    else setError(true);
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
  if (!data) return <p className="suave" role="status">Cargando tu tabla...</p>;

  async function agregarRegistro(valores: Record<string, unknown>) {
    await fetch(`/api/records/${datasetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valores),
    });
    await cargar();
  }

  const registrosFiltrados = filtrarRegistros(data.records, busqueda);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <Link href="/dashboard" className="migas">&larr; Mis tablas</Link>
          <h1>{data.dataset.nombre}</h1>
          <p className="suave">{data.records.length} {data.records.length === 1 ? "registro" : "registros"}</p>
        </div>
      </div>

      <details className="tarjeta plegable" open>
        <summary>Agregar un registro</summary>
        <div className="plegable-cuerpo">
          <DynamicForm columnas={data.dataset.columnas} onSubmit={agregarRegistro} />
        </div>
      </details>

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
          {registrosFiltrados.length} de {data.records.length}
        </span>
      </div>

      <DynamicTable columnas={data.dataset.columnas} registros={registrosFiltrados} />
    </>
  );
}
