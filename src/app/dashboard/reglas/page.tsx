"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReglasModulo from "@/components/ReglasModulo";
import type { Columna } from "@/lib/excel-parser";
import type { Regla } from "@/lib/reglas";

interface ModuloConReglas {
  datasetId: string;
  nombre: string;
  columnas: Columna[];
  reglas: Regla[];
}

// Un solo lugar para ver y armar TODAS las reglas de la empresa, módulo por
// módulo -- antes vivían escondidas dentro de "Editar módulo y campos" de cada
// módulo por separado y nadie las encontraba. Separación en 3 niveles pedida
// explícitamente (modelo Gambit System de FFXII): Módulo (una tarjeta por
// módulo) -> Campo (el "Si <campo> = ..." dentro de cada regla) -> Acción.
export default function ReglasPage() {
  const [modulos, setModulos] = useState<ModuloConReglas[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reglas")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudieron cargar las reglas");
        setModulos(body.modulos);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Reglas</h1>
          <p className="suave">
            Qué debe pasar solo cuando algo cambia en un módulo -- ej. que un pedido "Cancelado" no cuente como ingreso,
            o que una venta ajuste tu Stock automáticamente.
          </p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!modulos && !error && <p className="suave">Cargando...</p>}

      {modulos && modulos.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay ningún módulo con reglas</h3>
          <p className="suave">
            Las reglas se arman sobre un campo marcado como "Estado" (Pendiente, En proceso, Cancelado...). Entra a un
            módulo, abre "Editar tabla y campos" y marca el significado "Estado" en el campo que corresponda -- después
            reaparece acá.
          </p>
          <Link href="/dashboard" className="btn btn-primario">Ir a Inicio</Link>
        </div>
      )}

      {modulos?.map((m) => (
        <ReglasModulo key={m.datasetId} datasetId={m.datasetId} nombre={m.nombre} columnas={m.columnas} reglas={m.reglas} />
      ))}
    </>
  );
}
