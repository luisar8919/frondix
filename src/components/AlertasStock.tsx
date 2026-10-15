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
interface ModuloSinConfigurar { datasetId: string; datasetNombre: string }

const CLAVE_CERRADO = "frondix_stock_minimo_tip_cerrado";

// Dos estados posibles: hay módulos de Stock sin un "Stock mínimo" marcado
// (se enseña la función y cómo activarla, para que no quede invisible hasta
// que alguien la descubra solo -- ver src/lib/alertasStock.ts), o hay alertas
// reales de productos por agotarse.
export default function AlertasStock() {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [sinConfigurar, setSinConfigurar] = useState<ModuloSinConfigurar[]>([]);
  const [tipCerrado, setTipCerrado] = useState(true); // arranca oculto hasta leer localStorage, para no parpadear

  useEffect(() => {
    try { setTipCerrado(localStorage.getItem(CLAVE_CERRADO) === "1"); } catch { /* sin almacenamiento */ }
    fetch("/api/alertas-stock")
      .then((res) => res.json())
      .then((body) => { setAlertas(body.alertas ?? []); setSinConfigurar(body.modulosSinConfigurar ?? []); })
      .catch(() => setAlertas([]));
  }, []);

  function cerrarTip() {
    setTipCerrado(true);
    try { localStorage.setItem(CLAVE_CERRADO, "1"); } catch { /* sin almacenamiento */ }
  }

  if (alertas && alertas.length > 0) {
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

  if (!tipCerrado && sinConfigurar.length > 0) {
    return (
      <div className="tarjeta tarjeta-elevada" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ margin: 0 }}>💡 Te avisamos cuando se te acabe un producto</h3>
          <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={cerrarTip}>Cerrar</button>
        </div>
        <p className="suave pequeno" style={{ margin: "8px 0 14px" }}>
          En {sinConfigurar.length === 1 ? "tu módulo de" : "tus módulos de"} Stock todavía no marcaste desde cuántas
          unidades avisarte. Entra al módulo, abre &quot;Editar módulo y campos&quot; y en la columna de cantidad
          mínima elige &quot;Stock mínimo&quot; — desde ahí Frondix te avisa solo.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {sinConfigurar.map((m) => (
            <Link key={m.datasetId} href={`/dashboard/${m.datasetId}`} className="btn btn-secundario">
              Configurar en &quot;{m.datasetNombre}&quot;
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
