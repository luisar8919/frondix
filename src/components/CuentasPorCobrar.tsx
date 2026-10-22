"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Cuenta { datasetId: string; datasetNombre: string; recordId: string; cliente: string | null; fecha: string | null; saldo: number }
interface ModuloSinConfigurar { datasetId: string; datasetNombre: string }
interface Abono { id: string; monto: number; fecha: string; notas: string | null }

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
const CLAVE_CERRADO = "frondix_saldo_pendiente_tip_cerrado";

// Ventas a crédito: muestra las cuentas reales si hay alguna, o -- si ningún
// módulo de Ventas tiene la columna activada todavía -- un tip que se cierra
// una sola vez (no todo negocio vende al fiado, así que no es una alerta
// persistente como el stock mínimo, solo un aviso de que la opción existe).
// Cada cuenta se puede abonar (pago parcial, ver /api/cuentas-por-cobrar/abonos):
// resta del saldo y queda historial de cuándo y cuánto pagó.
export default function CuentasPorCobrar() {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [sinConfigurar, setSinConfigurar] = useState<ModuloSinConfigurar[]>([]);
  const [tipCerrado, setTipCerrado] = useState(true);

  const [abonando, setAbonando] = useState<string | null>(null); // recordId
  const [montoAbono, setMontoAbono] = useState("");
  const [notasAbono, setNotasAbono] = useState("");
  const [enviandoAbono, setEnviandoAbono] = useState(false);
  const [errorAbono, setErrorAbono] = useState("");

  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null); // recordId
  const [historial, setHistorial] = useState<Abono[] | null>(null);

  function cargar() {
    fetch("/api/cuentas-por-cobrar")
      .then((res) => res.json())
      .then((body) => { setCuentas(body.cuentas ?? []); setSinConfigurar(body.modulosSinConfigurar ?? []); })
      .catch(() => setCuentas([]));
  }

  useEffect(cargar, []);

  function cerrarTip() {
    setTipCerrado(true);
    try { localStorage.setItem(CLAVE_CERRADO, "1"); } catch { /* sin almacenamiento */ }
  }
  useEffect(() => {
    try { setTipCerrado(localStorage.getItem(CLAVE_CERRADO) === "1"); } catch { /* sin almacenamiento */ }
  }, []);

  function abrirAbono(recordId: string) {
    setAbonando(abonando === recordId ? null : recordId);
    setMontoAbono(""); setNotasAbono(""); setErrorAbono("");
  }

  async function registrarAbono(c: Cuenta) {
    const monto = Number(montoAbono);
    if (!Number.isFinite(monto) || monto <= 0) return setErrorAbono("Ingresa un monto válido");
    setEnviandoAbono(true);
    setErrorAbono("");
    const res = await fetch("/api/cuentas-por-cobrar/abonos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasetId: c.datasetId, recordId: c.recordId, monto, notas: notasAbono }),
    });
    const body = await res.json().catch(() => ({}));
    setEnviandoAbono(false);
    if (!res.ok) return setErrorAbono(body.error ?? "No se pudo registrar el abono");
    setAbonando(null);
    cargar();
  }

  function verHistorial(recordId: string) {
    if (historialAbierto === recordId) return setHistorialAbierto(null);
    setHistorialAbierto(recordId);
    setHistorial(null);
    fetch(`/api/cuentas-por-cobrar/abonos?recordId=${recordId}`)
      .then((res) => res.json())
      .then((body) => setHistorial(body.abonos ?? []))
      .catch(() => setHistorial([]));
  }

  if (cuentas && cuentas.length > 0) {
    const total = Math.round(cuentas.reduce((s, c) => s + c.saldo, 0) * 100) / 100;
    return (
      <div className="tarjeta" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Cuentas por cobrar</h3>
        <p className="suave pequeno" style={{ margin: "4px 0 14px" }}>
          Ventas a crédito con saldo pendiente, según la columna &quot;Saldo pendiente&quot; de cada módulo.
        </p>
        {cuentas.map((c) => (
          <div key={c.recordId} style={{ borderBottom: "1px solid var(--linea)", padding: "8px 0" }}>
            <div className="alerta alerta-aviso" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <span>
                {c.cliente ? <strong>{c.cliente}</strong> : <span className="suave">Sin cliente</span>} en <Link href={`/dashboard/${c.datasetId}`}>{c.datasetNombre}</Link>
                {c.fecha && <span className="suave"> · {c.fecha}</span>}
              </span>
              <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{soles(c.saldo)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-fantasma pequeno" style={{ padding: "2px 10px" }} onClick={() => abrirAbono(c.recordId)}>
                {abonando === c.recordId ? "Cancelar" : "Registrar abono"}
              </button>
              <button type="button" className="btn btn-fantasma pequeno" style={{ padding: "2px 10px" }} onClick={() => verHistorial(c.recordId)}>
                {historialAbierto === c.recordId ? "Ocultar historial" : "Ver historial"}
              </button>
            </div>

            {abonando === c.recordId && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <input
                  type="number" step="any" min={0} placeholder="Monto"
                  value={montoAbono} onChange={(e) => setMontoAbono(e.target.value)}
                  style={{ maxWidth: 120 }}
                />
                <input
                  placeholder="Notas (opcional)" value={notasAbono} onChange={(e) => setNotasAbono(e.target.value)}
                  style={{ flex: 1, minWidth: 140 }}
                />
                <button type="button" className="btn btn-primario pequeno" disabled={enviandoAbono} onClick={() => registrarAbono(c)}>
                  {enviandoAbono ? "Guardando..." : "Guardar"}
                </button>
              </div>
            )}
            {abonando === c.recordId && errorAbono && <p className="alerta alerta-error pequeno" role="alert" style={{ marginTop: 6 }}>{errorAbono}</p>}

            {historialAbierto === c.recordId && (
              <div style={{ marginTop: 8 }}>
                {historial === null && <p className="suave pequeno">Cargando...</p>}
                {historial && historial.length === 0 && <p className="suave pequeno">Todavía no hay abonos.</p>}
                {historial?.map((a) => (
                  <p key={a.id} className="suave pequeno" style={{ margin: "2px 0" }}>
                    {fechaCorta(a.fecha)} — {soles(a.monto)}{a.notas ? ` (${a.notas})` : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
        <p style={{ margin: "10px 0 0", fontWeight: 700, paddingTop: 10 }}>
          Total por cobrar: {soles(total)}
        </p>
      </div>
    );
  }

  if (!tipCerrado && sinConfigurar.length > 0) {
    return (
      <div className="tarjeta" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ margin: 0 }}>💡 ¿Vendes al fiado?</h3>
          <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={cerrarTip}>Cerrar</button>
        </div>
        <p className="suave pequeno" style={{ margin: "8px 0 0" }}>
          Si algún cliente te paga después, puedes anotar cuánto te debe: entra a tu módulo de ventas,
          abre &quot;Editar módulo y campos&quot; y agrega una columna &quot;Saldo pendiente&quot; — Frondix
          va a sumar solo cuánto te deben en total.
        </p>
      </div>
    );
  }

  return null;
}
