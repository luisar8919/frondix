"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Cuenta { datasetId: string; datasetNombre: string; cliente: string | null; fecha: string | null; saldo: number }

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

// Ventas a crédito: solo aparece si algún módulo tiene una columna "Saldo
// pendiente" (rol saldo_pendiente) con filas en más de 0 -- ver
// src/lib/cuentasPorCobrar.ts. Es opcional, nadie ve esta tarjeta hasta que
// decide usar la función.
export default function CuentasPorCobrar() {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);

  useEffect(() => {
    fetch("/api/cuentas-por-cobrar")
      .then((res) => res.json())
      .then((body) => setCuentas(body.cuentas ?? []))
      .catch(() => setCuentas([]));
  }, []);

  if (!cuentas || cuentas.length === 0) return null;
  const total = Math.round(cuentas.reduce((s, c) => s + c.saldo, 0) * 100) / 100;

  return (
    <div className="tarjeta" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0 }}>Cuentas por cobrar</h3>
      <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
        Ventas a crédito con saldo pendiente, según la columna &quot;Saldo pendiente&quot; de cada módulo.
      </p>
      {cuentas.map((c, i) => (
        <div key={i} className="alerta alerta-aviso" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <span>
            {c.cliente ? <strong>{c.cliente}</strong> : <span className="suave">Sin cliente</span>} en <Link href={`/dashboard/${c.datasetId}`}>{c.datasetNombre}</Link>
            {c.fecha && <span className="suave"> · {c.fecha}</span>}
          </span>
          <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{soles(c.saldo)}</span>
        </div>
      ))}
      <p style={{ margin: "10px 0 0", fontWeight: 700, borderTop: "1px solid var(--verde-100)", paddingTop: 10 }}>
        Total por cobrar: {soles(total)}
      </p>
    </div>
  );
}
