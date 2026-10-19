"use client";

import { useEffect, useState } from "react";
import AlertasStock from "@/components/AlertasStock";
import ValorizacionStock from "@/components/ValorizacionStock";
import KardexProducto from "@/components/KardexProducto";

interface ModuloStock { datasetId: string; nombre: string; productos: string[] }

// Todo lo de inventario junto en un solo lugar (antes repartido entre Inicio
// y Reportes -> Balance): alertas de stock por agotarse, valorización de
// mercadería, y el Kardex (historial) de cada módulo de Stock.
export default function InventarioResumen() {
  const [stock, setStock] = useState<ModuloStock[] | null>(null);

  useEffect(() => {
    fetch("/api/inventario")
      .then((res) => res.json())
      .then((body) => setStock(body.stock ?? []))
      .catch(() => setStock([]));
  }, []);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Inventario</h1>
          <p className="suave">Alertas de stock, cuánto vale tu mercadería, y el historial de cada producto.</p>
        </div>
      </div>

      <AlertasStock />
      <ValorizacionStock />
      {stock?.map((s) => <KardexProducto key={s.datasetId} datasetId={s.datasetId} productos={s.productos} />)}
    </>
  );
}
