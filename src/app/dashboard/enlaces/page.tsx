"use client";

import { useEffect, useState } from "react";
import EnlacesTabla from "@/components/EnlacesTabla";
import type { DatasetResumen } from "@/lib/enlaces";

// Todos los enlaces entre módulos de la empresa, en un solo lugar -- antes
// cada módulo tenía su propia tarjeta "Enlazar con otros módulos" repetida en
// su propia página; ahora es una tarjeta por módulo acá, reusando el mismo
// componente (EnlacesTabla) tal cual.
export default function EnlacesPage() {
  const [datasets, setDatasets] = useState<DatasetResumen[] | null>(null);
  const [error, setError] = useState("");

  function cargar() {
    return fetch("/api/enlaces")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudieron cargar los enlaces");
        setDatasets(body.datasets);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Enlaces</h1>
          <p className="suave">
            Qué columna de un módulo viene de otro -- ej. el Cliente de una venta debe existir en Clientes, o el
            Producto en Stock. Esto habilita el autocompletado, valida que no se escriba cualquier cosa, y es lo que
            usa la regla "Ajustar Stock automáticamente".
          </p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!datasets && !error && <p className="suave">Cargando...</p>}

      {datasets && datasets.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay módulos</h3>
          <p className="suave">Sube tu primer Excel para empezar a enlazar módulos entre sí.</p>
        </div>
      )}

      {datasets?.map((d) => (
        <div key={d.id} style={{ marginBottom: 14 }}>
          <h3 style={{ margin: "0 0 6px" }}>{d.nombre}</h3>
          <EnlacesTabla datasetId={d.id} columnas={d.columnas} otras={datasets.filter((x) => x.id !== d.id)} onGuardado={cargar} />
        </div>
      ))}
    </>
  );
}
