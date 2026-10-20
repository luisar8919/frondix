"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Cuenta { datasetId: string; datasetNombre: string; proveedor: string | null; fecha: string | null; saldo: number }
interface ModuloSinConfigurar { datasetId: string; datasetNombre: string }

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const CLAVE_CERRADO = "frondix_saldo_pendiente_pagar_tip_cerrado";

// Espejo de CuentasPorCobrar.tsx del lado de Compras: lo que le debés a tus
// proveedores en vez de lo que te deben tus clientes.
export default function CuentasPorPagar() {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [sinConfigurar, setSinConfigurar] = useState<ModuloSinConfigurar[]>([]);
  const [tipCerrado, setTipCerrado] = useState(true);

  useEffect(() => {
    try { setTipCerrado(localStorage.getItem(CLAVE_CERRADO) === "1"); } catch { /* sin almacenamiento */ }
    fetch("/api/cuentas-por-pagar")
      .then((res) => res.json())
      .then((body) => { setCuentas(body.cuentas ?? []); setSinConfigurar(body.modulosSinConfigurar ?? []); })
      .catch(() => setCuentas([]));
  }, []);

  function cerrarTip() {
    setTipCerrado(true);
    try { localStorage.setItem(CLAVE_CERRADO, "1"); } catch { /* sin almacenamiento */ }
  }

  if (cuentas && cuentas.length > 0) {
    const total = Math.round(cuentas.reduce((s, c) => s + c.saldo, 0) * 100) / 100;
    return (
      <div className="tarjeta" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Cuentas por pagar</h3>
        <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
          Compras a crédito con saldo pendiente, según la columna &quot;Saldo pendiente&quot; de cada módulo.
        </p>
        {cuentas.map((c, i) => (
          <div key={i} className="alerta alerta-aviso" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <span>
              {c.proveedor ? <strong>{c.proveedor}</strong> : <span className="suave">Sin proveedor</span>} en <Link href={`/dashboard/${c.datasetId}`}>{c.datasetNombre}</Link>
              {c.fecha && <span className="suave"> · {c.fecha}</span>}
            </span>
            <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{soles(c.saldo)}</span>
          </div>
        ))}
        <p style={{ margin: "10px 0 0", fontWeight: 700, borderTop: "1px solid var(--verde-100)", paddingTop: 10 }}>
          Total por pagar: {soles(total)}
        </p>
      </div>
    );
  }

  if (!tipCerrado && sinConfigurar.length > 0) {
    return (
      <div className="tarjeta" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ margin: 0 }}>💡 ¿Compras al crédito?</h3>
          <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={cerrarTip}>Cerrar</button>
        </div>
        <p className="suave pequeno" style={{ margin: "8px 0 0" }}>
          Si algún proveedor te cobra después, puedes anotar cuánto le debes: entra a tu módulo de compras,
          abre &quot;Editar módulo y campos&quot; y agrega una columna &quot;Saldo pendiente&quot; — Frondix
          va a sumar solo cuánto debes en total.
        </p>
      </div>
    );
  }

  return null;
}
