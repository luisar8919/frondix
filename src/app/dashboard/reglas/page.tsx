"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReglasModulo from "@/components/ReglasModulo";
import RecetasModulo from "@/components/RecetasModulo";
import type { Columna } from "@/lib/excel-parser";
import type { Regla } from "@/lib/reglas";

interface AjustarStockInfo {
  tipoModulo: "ventas" | "compras";
  stockNombre: string;
  cantidadLabel: string | null;
}

interface CandidatoSumarCampo {
  columnaEnlaceKey: string;
  columnaEnlaceLabel: string;
  columnaObjetivoKey: string;
  columnaObjetivoLabel: string;
  datasetObjetivoNombre: string;
  tipoObjetivo: "numero" | "texto";
  opcionesObjetivo: string[] | null;
}

interface ModuloConReglas {
  datasetId: string;
  nombre: string;
  columnas: Columna[];
  reglas: Regla[];
  ajustarStockInfo: AjustarStockInfo | null;
  hayTelefono: boolean;
  hayCliente: boolean;
  candidatosSumarCampo: CandidatoSumarCampo[];
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
            Las reglas se arman sobre campos ya mapeados (Estado, Monto, Cantidad, Stock mínimo...). Entra a un módulo,
            abre "Editar tabla y campos" y marcale un significado a alguno -- después reaparece acá.
          </p>
          <Link href="/dashboard" className="btn btn-primario">Ir a Inicio</Link>
        </div>
      )}

      {modulos?.map((m) => {
        // `version` fuerza un remount de ambos componentes del módulo cuando
        // una receta guarda -- si no, ReglasModulo (que copia `reglas` a su
        // propio estado SOLO al montar) quedaría mostrando reglas viejas
        // hasta un refresh manual.
        const version = m.reglas.map((r) => r.id).join(",");
        return (
          <div key={m.datasetId}>
            <RecetasModulo
              key={`recetas-${m.datasetId}-${version}`}
              datasetId={m.datasetId}
              nombre={m.nombre}
              columnas={m.columnas}
              reglas={m.reglas}
              onGuardado={(reglas) => setModulos((ms) => ms?.map((x) => (x.datasetId === m.datasetId ? { ...x, reglas } : x)) ?? ms)}
            />
            <ReglasModulo
              key={`avanzado-${m.datasetId}-${version}`}
              datasetId={m.datasetId}
              nombre={`${m.nombre} (modo avanzado)`}
              columnas={m.columnas}
              reglas={m.reglas}
              ajustarStockInfo={m.ajustarStockInfo}
              hayTelefono={m.hayTelefono}
              hayCliente={m.hayCliente}
              candidatosSumarCampo={m.candidatosSumarCampo}
            />
          </div>
        );
      })}
    </>
  );
}
