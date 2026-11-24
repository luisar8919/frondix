"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DynamicForm from "@/components/DynamicForm";
import { normalizarTelefonoPE } from "@/lib/seguimiento";
import type { Columna } from "@/lib/excel-parser";
import type { DatasetResumen } from "@/lib/enlaces";

const LIMITE_RECIENTES = 30;

// Ventanilla de atención al cliente: para negocios que NO son retail con
// stock (Reservas, Delivery, Alquileres, Órdenes de servicio, Membresías,
// Eventos...) -- el trabajo real de mostrador acá es 2 cosas: registrar una
// interacción nueva, y sobre todo, actualizar su Estado rápido (marcar una
// reserva "Atendida", un equipo "Devuelto") SIN tipear nada a mano (hoy la
// única forma es doble clic en la tabla, un <input> de texto libre que no
// sabe que esa columna tiene una lista cerrada de valores).
//
// Mismo principio que Punto de Venta (que sirve a cualquier Ventas+Stock sin
// importar qué vendas): esto sirve a cualquier módulo con un campo "Estado"
// de lista cerrada + un contacto real (cliente o teléfono), sin importar el
// rubro -- se arma solo a partir de las columnas reales (ver el filtro
// `tipo=atencion` en api/datasets/route.ts), nunca una pantalla por rubro.
//
// Reusa el mismo DynamicForm y los mismos endpoints de /api/records que ya
// usa la página normal de un módulo -- cero backend nuevo.
export default function VentanillaAtencion() {
  const [modulos, setModulos] = useState<{ id: string; nombre: string }[] | null>(null);
  const [datasetId, setDatasetId] = useState("");
  const [columnas, setColumnas] = useState<Columna[]>([]);
  const [otras, setOtras] = useState<DatasetResumen[]>([]);
  const [registros, setRegistros] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [opciones, setOpciones] = useState<Record<string, string[]>>({});
  const [precios, setPrecios] = useState<Record<string, Record<string, { general?: number; mayorista?: number; minorista?: number }>>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/datasets?tipo=atencion")
      .then((res) => res.json())
      .then((body) => {
        const lista = (body.datasets ?? []) as { id: string; nombre: string }[];
        setModulos(lista);
        if (lista.length === 1) setDatasetId(lista[0].id);
      })
      .catch(() => setModulos([]));
  }, []);

  async function cargarOpciones(cols: Columna[]) {
    const entradas = await Promise.all(
      cols
        .filter((c) => c.enlace)
        .map(async (c) => {
          const res = await fetch(`/api/records/${c.enlace!.datasetId}/valores?columna=${c.enlace!.columnaKey}`);
          const body = res.ok ? await res.json() : { valores: [], precios: {} };
          return [c.key, body.valores as string[], body.precios as Record<string, { general?: number; mayorista?: number; minorista?: number }>] as const;
        })
    );
    setOpciones(Object.fromEntries(entradas.map(([k, valores]) => [k, valores])));
    setPrecios(Object.fromEntries(entradas.filter(([, , p]) => Object.keys(p ?? {}).length > 0).map(([k, , p]) => [k, p])));
  }

  useEffect(() => {
    if (!datasetId) return;
    setCargando(true);
    setError("");
    setAbierto(null);
    (async () => {
      const res = await fetch(`/api/records/${datasetId}?limite=${LIMITE_RECIENTES}`);
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "No se pudo cargar el módulo"); setCargando(false); return; }
      setColumnas(body.dataset.columnas);
      setOtras(body.otras ?? []);
      setRegistros(body.records ?? []);
      cargarOpciones(body.dataset.columnas);
      setCargando(false);
    })();
  }, [datasetId]);

  const cEstado = columnas.find((c) => c.rol === "estado" && (c.opcionesFijas?.length ?? 0) > 0);
  const cNombre = columnas.find((c) => c.rol === "cliente") ?? columnas.find((c) => c.rol === "producto");
  const cTelefono = columnas.find((c) => c.rol === "telefono");

  const etiquetasEnlace = Object.fromEntries(
    columnas
      .filter((c) => c.enlace)
      .map((c) => {
        const destino = otras.find((d) => d.id === c.enlace!.datasetId);
        const col = destino?.columnas.find((x) => x.key === c.enlace!.columnaKey);
        return [c.key, destino ? `${destino.nombre} > ${col?.label ?? c.enlace!.columnaKey}` : "otro módulo"];
      })
  );

  async function agregar(valores: Record<string, unknown>): Promise<string | null> {
    const res = await fetch(`/api/records/${datasetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valores),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? "No se pudo registrar";
    setRegistros((rs) => [body.record, ...rs].slice(0, LIMITE_RECIENTES));
    cargarOpciones(columnas);
    return null;
  }

  async function cambiarEstado(registroId: string, valor: string) {
    if (!cEstado) return;
    const registro = registros.find((r) => r.id === registroId);
    if (!registro) return;
    setCambiando(registroId);
    // El PATCH reemplaza TODO el `data` con lo que se mande (no lo mezcla
    // solo), mismo motivo por el que guardarCelda en la página del dataset
    // arma `{...r.data, [key]: valor}` antes de mandarlo -- sin esto, cambiar
    // el estado borraba el resto de los campos del registro.
    const res = await fetch(`/api/records/${datasetId}/${registroId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { ...registro.data, [cEstado.key]: valor } }),
    });
    const body = await res.json();
    setCambiando(null);
    if (!res.ok) return;
    setRegistros((rs) => rs.map((r) => (r.id === registroId ? { ...r, data: body.record.data } : r)));
    setAbierto(null);
  }

  if (modulos === null) return <p className="suave">Cargando...</p>;

  if (modulos.length === 0) {
    return (
      <div className="tarjeta vacio">
        <h2 style={{ fontSize: 22 }}>Todavía no tienes un módulo para Atención</h2>
        <p className="suave">
          Esto es para negocios con Reservas, Delivery, Alquileres, Órdenes de servicio, Membresías, Eventos... --
          cualquier módulo con un campo &quot;Estado&quot; y el contacto de tu cliente. Créalo desde &quot;+ Agregar módulo&quot;.
        </p>
        <Link href="/dashboard/modulos/nuevo" className="btn btn-primario">Agregar módulo</Link>
      </div>
    );
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Atención</h1>
          <p className="suave">Registra una interacción nueva y actualiza su estado en un toque.</p>
        </div>
        {modulos.length > 1 && (
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            <option value="" disabled>Elige un módulo...</option>
            {modulos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        )}
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {cargando && <p className="suave">Cargando...</p>}

      {!cargando && !error && datasetId && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <details className="tarjeta plegable" style={{ flex: "1 1 320px" }} open>
            <summary>Registrar nuevo</summary>
            <div className="plegable-cuerpo">
              <DynamicForm
                columnas={columnas}
                opciones={opciones}
                etiquetasEnlace={etiquetasEnlace}
                precios={precios}
                onSubmit={agregar}
                textoBoton="Registrar"
              />
            </div>
          </details>

          <div className="tarjeta" style={{ flex: "2 1 420px" }}>
            <h3 style={{ marginTop: 0 }}>Recientes</h3>
            {registros.length === 0 && <p className="suave pequeno">Todavía no hay nada registrado.</p>}
            {registros.map((r) => {
              const nombre = String(r.data[cNombre?.key ?? ""] ?? "(sin nombre)");
              const estadoActual = cEstado ? String(r.data[cEstado.key] ?? "") : "";
              const wa = cTelefono ? normalizarTelefonoPE(r.data[cTelefono.key]) : null;
              return (
                <div key={r.id} style={{ borderBottom: "1px solid var(--linea)", padding: "10px 0" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ flex: 1 }}>{nombre}</strong>
                    {estadoActual && <span className="insignia">{estadoActual}</span>}
                    {wa && (
                      <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn btn-fantasma" style={{ padding: "4px 10px" }}>
                        WhatsApp
                      </a>
                    )}
                    {cEstado && (
                      <button
                        type="button"
                        className="btn btn-secundario"
                        style={{ padding: "4px 10px" }}
                        onClick={() => setAbierto(abierto === r.id ? null : r.id)}
                      >
                        Cambiar estado
                      </button>
                    )}
                  </div>
                  {abierto === r.id && cEstado && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {(cEstado.opcionesFijas ?? []).filter((v) => v !== estadoActual).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="btn btn-primario"
                          disabled={cambiando === r.id}
                          onClick={() => cambiarEstado(r.id, v)}
                        >
                          {cambiando === r.id ? "..." : v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
