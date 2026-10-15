"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Alerta {
  datasetId: string;
  datasetNombre: string;
  producto: string;
  cantidad: number;
  minimo: number;
}

// Solo se muestra si hay al menos un módulo de Stock con una columna "Stock
// mínimo" configurada (ver src/lib/alertasStock.ts) -- es opcional, nadie ve
// esta tarjeta hasta que decide usar la función.
export default function AlertasStock() {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);

  useEffect(() => {
    fetch("/api/alertas-stock")
      .then((res) => res.json())
      .then((body) => setAlertas(body.alertas ?? []))
      .catch(() => setAlertas([]));
  }, []);

  if (!alertas || alertas.length === 0) return null;

  return (
    <div className="tarjeta" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0 }}>Stock por agotarse</h3>
      <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
        Productos por debajo del mínimo que marcaste en cada módulo de Stock.
      </p>
      {alertas.map((a) => (
        <div key={`${a.datasetId}-${a.producto}`} className="alerta alerta-aviso" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <span>
            <strong>{a.producto}</strong> en <Link href={`/dashboard/${a.datasetId}`}>{a.datasetNombre}</Link>
          </span>
          <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{a.cantidad} / mín. {a.minimo}</span>
        </div>
      ))}
    </div>
  );
}
