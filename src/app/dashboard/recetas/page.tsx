"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RecetasModulo from "@/components/RecetasModulo";
import type { Columna } from "@/lib/excel-parser";
import type { Regla } from "@/lib/reglas";

interface ModuloConReglas {
  datasetId: string;
  nombre: string;
  columnas: Columna[];
  reglas: Regla[];
}

// Galería de recetas: reglas pre-armadas en lenguaje simple (ícono + frase +
// a lo sumo un valor), separada del editor técnico ("Condicionales",
// /dashboard/reglas) y de los Enlaces -- 3 opciones del desplegable "Reglas"
// de la barra. Reusa /api/reglas (mismos datos que ya consume Condicionales)
// para no duplicar un endpoint solo por vivir en otra pantalla.
export default function RecetasPage() {
  const [modulos, setModulos] = useState<ModuloConReglas[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reglas")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudieron cargar las recetas");
        setModulos(body.modulos);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Recetas</h1>
          <p className="suave">
            Reglas listas para activar en un clic, sin configurar nada técnico -- ej. que te avisemos en ventas grandes,
            o que un Cliente vacío se complete solo. Lo más fino sigue en "Condicionales".
          </p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!modulos && !error && <p className="suave">Cargando...</p>}

      {modulos && modulos.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay ningún módulo con campos mapeados</h3>
          <p className="suave">
            Las recetas se arman sobre campos ya mapeados (Cliente, Monto, Estado...). Entra a un módulo, abre
            "Editar tabla y campos" y marcale un significado a alguno -- después reaparece acá.
          </p>
          <Link href="/dashboard" className="btn btn-primario">Ir a Inicio</Link>
        </div>
      )}

      {modulos?.map((m) => (
        <RecetasModulo
          key={m.datasetId}
          datasetId={m.datasetId}
          nombre={m.nombre}
          columnas={m.columnas}
          reglas={m.reglas}
          onGuardado={(reglas) => setModulos((ms) => ms?.map((x) => (x.datasetId === m.datasetId ? { ...x, reglas } : x)) ?? ms)}
        />
      ))}
    </>
  );
}
