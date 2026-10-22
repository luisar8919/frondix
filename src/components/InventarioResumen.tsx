"use client";

import { useEffect, useState } from "react";
import ValorizacionStock from "@/components/ValorizacionStock";
import KardexProducto from "@/components/KardexProducto";
import CatalogoCompartir from "@/components/CatalogoCompartir";

interface ModuloStock { datasetId: string; nombre: string; productos: string[] }
interface StockPorAlmacen { datasetId: string; datasetNombre: string; cantidad: number }
interface ProductoCombinado { producto: string; total: number; porAlmacen: StockPorAlmacen[] }

// "Módulos > Stock > Reporte": valorización de mercadería, el total combinado
// cuando hay más de un almacén (cada módulo de Stock es, en los hechos, un
// almacén propio), y el Kardex de cada producto. Las alertas de stock por
// agotarse viven aparte, en "Seguimiento > Alertas" (ver AlertasStock.tsx).
export default function InventarioResumen() {
  const [stock, setStock] = useState<ModuloStock[] | null>(null);
  const [combinado, setCombinado] = useState<ProductoCombinado[]>([]);

  useEffect(() => {
    fetch("/api/inventario")
      .then((res) => res.json())
      .then((body) => { setStock(body.stock ?? []); setCombinado(body.combinado ?? []); })
      .catch(() => setStock([]));
  }, []);

  const hayMultiAlmacen = stock && stock.length > 1;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Stock</h1>
          <p className="suave">Cuánto vale tu mercadería y el historial de cada producto.</p>
        </div>
      </div>

      <ValorizacionStock />
      <CatalogoCompartir />

      {hayMultiAlmacen && combinado.length > 0 && (
        <div className="tarjeta" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Total combinado por producto</h3>
          <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
            Sumando los {stock.length} módulos de Stock que tienes ({stock.map((s) => s.nombre).join(", ")}).
          </p>
          <div className="tabla-envoltura" style={{ boxShadow: "none", border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Total</th>
                  <th>Por almacén</th>
                </tr>
              </thead>
              <tbody>
                {combinado.map((p) => (
                  <tr key={p.producto}>
                    <td>{p.producto}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{p.total}</td>
                    <td className="suave pequeno">
                      {p.porAlmacen.map((a) => `${a.datasetNombre}: ${a.cantidad}`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stock?.map((s) => <KardexProducto key={s.datasetId} datasetId={s.datasetId} productos={s.productos} />)}
    </>
  );
}
