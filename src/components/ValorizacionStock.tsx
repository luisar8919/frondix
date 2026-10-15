"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Modulo { datasetId: string; datasetNombre: string; valorTotal: number; productosSinCosto: number }
interface Respuesta { modulos: Modulo[]; total: number }

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

// Cuánto dinero hay "parado" en mercadería almacenada -- solo se muestra si hay
// al menos un módulo de Stock con cantidades y algún precio de compra conocido
// (ver src/lib/valorizacionInventario.ts). Sin eso, no hay nada que mostrar.
export default function ValorizacionStock() {
  const [datos, setDatos] = useState<Respuesta | null>(null);

  useEffect(() => {
    fetch("/api/valorizacion-inventario")
      .then((res) => res.json())
      .then((body) => setDatos(body.modulos ? body : null))
      .catch(() => setDatos(null));
  }, []);

  if (!datos || datos.modulos.length === 0) return null;

  return (
    <div className="tarjeta" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0 }}>¿Cuánto vale tu mercadería? (Valorización de inventario)</h3>
      <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
        Cuánto dinero tienes guardado en productos sin vender: la cantidad de cada uno × lo que en promedio te costó comprarlo.
      </p>
      {datos.modulos.map((m) => (
        <div key={m.datasetId} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <Link href={`/dashboard/${m.datasetId}`}>{m.datasetNombre}</Link>
          <span style={{ whiteSpace: "nowrap" }}>
            <strong>{soles(m.valorTotal)}</strong>
            {m.productosSinCosto > 0 && (
              <span className="suave pequeno" style={{ marginLeft: 6 }}>
                ({m.productosSinCosto} sin costo conocido)
              </span>
            )}
          </span>
        </div>
      ))}
      <p style={{ margin: "10px 0 0", fontWeight: 700, borderTop: "1px solid var(--verde-100)", paddingTop: 10 }}>
        Total: {soles(datos.total)}
      </p>
    </div>
  );
}
