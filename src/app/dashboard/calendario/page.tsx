"use client";

import { useEffect, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import type { Columna } from "@/lib/excel-parser";

interface DatasetConFecha {
  id: string;
  nombre: string;
}

interface EntradaDia {
  hora: string | null;
  producto: string | null;
  cliente: string | null;
  monto: number | null;
}

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];
const NOMBRES_MES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

export default function CalendarioPage() {
  const [cargando, setCargando] = useState(true);
  const [datasets, setDatasets] = useState<DatasetConFecha[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [anio, setAnio] = useState(0);
  const [mes, setMes] = useState(0); // 1-12
  const [dias, setDias] = useState<Record<string, EntradaDia[]>>({});
  const [diaElegido, setDiaElegido] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargandoMes, setCargandoMes] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = crearClienteBrowser();
      const sesion = await empresaDelUsuario(supabase);
      if (!sesion.ok) {
        setError(sesion.error);
        return setCargando(false);
      }
      const { data: ds } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", sesion.empresaId);
      const conFecha = (ds ?? []).filter((d) => (d.columnas as Columna[]).some((c) => c.rol === "fecha" && c.tipo === "fecha"));
      setDatasets(conFecha.map((d) => ({ id: d.id, nombre: d.nombre })));

      const hoy = new Date();
      setAnio(hoy.getFullYear());
      setMes(hoy.getMonth() + 1);
      if (conFecha.length > 0) setDatasetId(conFecha[0].id);
      setCargando(false);
    })();
  }, []);

  useEffect(() => {
    if (!datasetId || !anio || !mes) return;
    setDiaElegido(null);
    setCargandoMes(true);
    const mesStr = `${anio}-${String(mes).padStart(2, "0")}`;
    fetch(`/api/calendario?datasetId=${datasetId}&mes=${mesStr}`)
      .then((r) => r.json())
      .then((body) => setDias(body.dias ?? {}))
      .finally(() => setCargandoMes(false));
  }, [datasetId, anio, mes]);

  function cambiarMes(delta: number) {
    let m = mes + delta;
    let a = anio;
    if (m < 1) { m = 12; a--; }
    if (m > 12) { m = 1; a++; }
    setMes(m);
    setAnio(a);
  }

  if (cargando) return null;

  if (datasets.length === 0) {
    return (
      <>
        <div className="panel-cabecera">
          <div>
            <h1>Calendario</h1>
            <p className="suave">Reservas, citas, entregas: cualquier módulo con columna Fecha se puede ver acá.</p>
          </div>
        </div>
        {error && <p className="alerta alerta-error" role="alert">{error}</p>}
        <div className="tarjeta">
          <p className="suave">
            Todavía no tienes ningún módulo con una columna marcada como Fecha. Márcala en &quot;Editar tabla y
            campos&quot; de algún módulo, o súbelo así al cargar un Excel nuevo.
          </p>
        </div>
      </>
    );
  }

  const primerDiaSemana = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  const diasEnMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const celdas: (number | null)[] = [...Array(primerDiaSemana).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];
  const entradasDelDia = diaElegido ? dias[String(diaElegido)] ?? [] : [];

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Calendario</h1>
          <p className="suave">Reservas, citas, entregas: cualquier módulo con columna Fecha se puede ver acá.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} aria-label="Módulo">
          {datasets.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="btn btn-fantasma" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">‹</button>
          <strong style={{ minWidth: 150, textAlign: "center" }}>{NOMBRES_MES[mes - 1]} {anio}</strong>
          <button type="button" className="btn btn-fantasma" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">›</button>
        </div>
      </div>

      <div className="tarjeta" style={{ opacity: cargandoMes ? 0.6 : 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
          {DIAS_SEMANA.map((d, i) => (
            <div key={i} className="suave pequeno" style={{ textAlign: "center", fontWeight: 700 }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {celdas.map((dia, i) => {
            if (dia === null) return <div key={i} />;
            const entradas = dias[String(dia)] ?? [];
            const elegido = diaElegido === dia;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setDiaElegido(elegido ? null : dia)}
                style={{
                  aspectRatio: "1",
                  border: "1px solid var(--linea)",
                  borderRadius: 8,
                  background: elegido ? "var(--verde-100)" : entradas.length > 0 ? "var(--verde-50)" : "var(--papel)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 2,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: elegido ? 700 : 400 }}>{dia}</span>
                {entradas.length > 0 && (
                  <span className="pequeno" style={{ color: "var(--verde-700)", fontWeight: 700 }}>{entradas.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {diaElegido && (
        <div className="tarjeta" style={{ marginTop: 16, maxWidth: 460 }}>
          <h3 style={{ marginTop: 0 }}>{diaElegido} de {NOMBRES_MES[mes - 1]}</h3>
          {entradasDelDia.length === 0 ? (
            <p className="suave pequeno">Nada ese día.</p>
          ) : (
            entradasDelDia.map((e, i) => (
              <div key={i} style={{ padding: "8px 0", borderTop: i > 0 ? "1px solid var(--linea)" : undefined }}>
                <p style={{ margin: 0 }}>
                  {e.hora && <strong>{e.hora} </strong>}
                  {e.producto ?? "(sin producto)"} {e.cliente && <span className="suave">— {e.cliente}</span>}
                </p>
                {e.monto !== null && <p className="suave pequeno" style={{ margin: 0 }}>{soles(e.monto)}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
