"use client";

import { useEffect, useState, use as usePromise } from "react";
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
  const [busqueda, setBusqueda] = useState("");

  async function cargar() {
    const res = await fetch(`/api/records/${datasetId}`);
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  if (!data) return <main style={{ maxWidth: 720, margin: "40px auto" }}>Cargando...</main>;

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
    <main style={{ maxWidth: 960, margin: "40px auto" }}>
      <h1>{data.dataset.nombre}</h1>
      <DynamicForm columnas={data.dataset.columnas} onSubmit={agregarRegistro} />

      <input
        type="search"
        placeholder="Buscar..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
      <p style={{ color: "#999", fontSize: 13, marginTop: 0 }}>
        {registrosFiltrados.length} de {data.records.length} registros
      </p>

      <DynamicTable columnas={data.dataset.columnas} registros={registrosFiltrados} />
    </main>
  );
}
