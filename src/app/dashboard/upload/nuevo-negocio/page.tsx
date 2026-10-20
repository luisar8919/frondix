"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { ROLES, type RolColumna } from "@/lib/roles";
import type { Columna } from "@/lib/excel-parser";

interface ModuloSugerido {
  incluir: boolean;
  nombre: string;
  columnas: Columna[];
}

interface ModuloCreado {
  datasetId: string;
  nombre: string;
}

// Para quien no tiene ningún Excel que cargar: describe su negocio en sus
// palabras y la IA propone de 1 a 4 módulos (tablas) con sus columnas, listos
// para revisar y crear vacíos -- se llenan después a mano, o subiendo un Excel
// más adelante. Misma mecánica de revisión que /dashboard/upload, pero
// arrancando de una descripción en vez de un archivo.
export default function NuevoNegocioPage() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [planActivo, setPlanActivo] = useState<boolean | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modulos, setModulos] = useState<ModuloSugerido[] | null>(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<ModuloCreado[] | null>(null);

  useEffect(() => {
    const supabase = crearClienteBrowser();
    (async () => {
      const r = await empresaDelUsuario(supabase);
      if (!r.ok) return;
      setEmpresaId(r.empresaId);
      setPlanActivo(await tieneSuscripcionActiva(supabase, r.empresaId));
    })();
  }, []);

  async function sugerir() {
    if (!empresaId || !descripcion.trim()) return;
    setPensando(true);
    setError(null);
    try {
      const res = await fetch("/api/datasets/sugerir-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, descripcion }),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "No se pudo obtener la sugerencia");
      setModulos((body.modulos as { nombre: string; columnas: Columna[] }[]).map((m) => ({ ...m, incluir: true })));
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setPensando(false);
    }
  }

  function cambiarModulo(i: number, parche: Partial<ModuloSugerido>) {
    setModulos((ms) => ms!.map((m, j) => (j === i ? { ...m, ...parche } : m)));
  }

  function cambiarColumna(mi: number, key: string, parche: Partial<Columna>) {
    setModulos((ms) =>
      ms!.map((m, j) => (j !== mi ? m : { ...m, columnas: m.columnas.map((c) => (c.key === key ? { ...c, ...parche } : c)) }))
    );
  }

  function quitarColumna(mi: number, key: string) {
    setModulos((ms) => ms!.map((m, j) => (j !== mi ? m : { ...m, columnas: m.columnas.filter((c) => c.key !== key) })));
  }

  async function crearTodo() {
    if (!empresaId || !modulos) return;
    const incluidos = modulos.filter((m) => m.incluir && m.columnas.length > 0);
    if (incluidos.length === 0) return;
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/datasets/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, modulos: incluidos.map((m) => ({ nombre: m.nombre, columnas: m.columnas })) }),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "No se pudo crear los módulos");
      setResultado((body.datasets as { id: string; nombre: string }[]).map((d) => ({ datasetId: d.id, nombre: d.nombre })));
      setModulos(null);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Empezar sin Excel</h1>
          <p className="suave" style={{ maxWidth: "62ch" }}>
            Contanos a qué se dedica tu negocio y te proponemos las tablas con las que empezar. Las puedes
            revisar y editar antes de crearlas; nacen vacías, las llenas después a mano o subiendo un Excel.
          </p>
        </div>
      </div>

      {!modulos && !resultado && (
        <div className="tarjeta" style={{ maxWidth: 760 }}>
          <label htmlFor="descripcion">Tu negocio</label>
          <textarea
            id="descripcion"
            rows={4}
            maxLength={500}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Soy mecánico, reparo autos y vendo repuestos. Quiero llevar las reparaciones que hago, qué le cobro a cada cliente y qué repuestos tengo en stock."
          />
          {error && <p className="alerta alerta-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}

          {planActivo === false ? (
            <p className="alerta alerta-aviso" style={{ marginTop: 14 }}>
              Sugerir tablas con IA es parte del plan pago. <Link href="/dashboard/billing">Activa tu suscripción</Link> para usarlo.
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-primario"
              style={{ marginTop: 14 }}
              onClick={sugerir}
              disabled={pensando || !descripcion.trim() || !empresaId}
            >
              {pensando ? "Pensando..." : "Sugerir tablas"}
            </button>
          )}
        </div>
      )}

      {modulos && (
        <>
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          {modulos.map((m, mi) => (
            <div key={mi} className="tarjeta" style={{ marginBottom: 16, opacity: m.incluir ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div className="campo" style={{ margin: 0, maxWidth: 320 }}>
                  <label htmlFor={`nombre-${mi}`}>Nombre del módulo</label>
                  <input id={`nombre-${mi}`} value={m.nombre} maxLength={120} onChange={(e) => cambiarModulo(mi, { nombre: e.target.value })} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={m.incluir} onChange={(e) => cambiarModulo(mi, { incluir: e.target.checked })} />
                  Crear este módulo
                </label>
              </div>

              {m.incluir && (
                <div style={{ marginTop: 14 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 10 }}>Campos</h3>
                  {m.columnas.map((c) => (
                    <div key={c.key} className="fila-columna" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1.2fr) auto", marginBottom: 6, alignItems: "center" }}>
                      <input
                        value={c.label}
                        maxLength={60}
                        onChange={(e) => cambiarColumna(mi, c.key, { label: e.target.value })}
                        aria-label={`Nombre del campo ${c.key}`}
                      />
                      <select
                        value={c.rol ?? ""}
                        onChange={(e) => cambiarColumna(mi, c.key, { rol: (e.target.value || null) as RolColumna | null })}
                        aria-label={`Qué significa ${c.label}`}
                      >
                        <option value="">Sin significado especial</option>
                        {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
                      </select>
                      <button type="button" className="btn btn-fantasma pequeno" onClick={() => quitarColumna(mi, c.key)} aria-label={`Quitar ${c.label}`}>
                        Quitar
                      </button>
                    </div>
                  ))}
                  {m.columnas.length === 0 && <p className="suave pequeno">Sin campos: no se va a crear este módulo.</p>}
                </div>
              )}
            </div>
          ))}

          <div className="centrado" style={{ marginTop: 10, display: "flex", gap: 10, justifyContent: "center" }}>
            <button type="button" className="btn btn-fantasma" onClick={() => setModulos(null)}>Volver a describir</button>
            <button
              type="button"
              className="btn btn-primario btn-grande"
              onClick={crearTodo}
              disabled={creando || !modulos.some((m) => m.incluir && m.columnas.length > 0)}
            >
              {creando ? "Creando..." : `Crear ${modulos.filter((m) => m.incluir && m.columnas.length > 0).length} módulo(s)`}
            </button>
          </div>
        </>
      )}

      {resultado && (
        <div className="tarjeta tarjeta-elevada" style={{ maxWidth: 760, marginTop: 20 }}>
          <h2 style={{ fontSize: 22 }}>
            Listo: se {resultado.length === 1 ? "creó 1 módulo" : `crearon ${resultado.length} módulos`}
          </h2>
          <div className="grilla-tablas" style={{ marginTop: 14 }}>
            {resultado.map((t) => (
              <Link key={t.datasetId} href={`/dashboard/${t.datasetId}`} className="tarjeta tarjeta-tabla">
                <h3>{t.nombre}</h3>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
