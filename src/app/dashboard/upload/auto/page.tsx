"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { ROLES, type RolColumna } from "@/lib/roles";
import type { Columna } from "@/lib/excel-parser";

interface GrupoDetectado {
  hojas: string[];
  nombreSugerido: string;
  columnas: Columna[];
  filasCount: number;
  confuso: boolean;
}

// Estado editable de cada grupo: si se incluye, su nombre y el label/rol de cada columna.
interface EdicionGrupo {
  incluir: boolean;
  nombre: string;
  columnas: { key: string; label: string; rol: RolColumna | "" }[];
}

interface TablaCreada {
  datasetId: string;
  nombre: string;
  hojas: string[];
  filasImportadas: number;
}

const aEdicion = (g: GrupoDetectado): EdicionGrupo => ({
  incluir: true,
  nombre: g.nombreSugerido,
  columnas: g.columnas.map((c) => ({ key: c.key, label: c.label, rol: (c.rol ?? "") as RolColumna | "" })),
});

export default function UploadAutoPage() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<GrupoDetectado[] | null>(null);
  const [hojasOmitidas, setHojasOmitidas] = useState<string[]>([]);
  const [ediciones, setEdiciones] = useState<EdicionGrupo[]>([]);
  const [sugiriendoIA, setSugiriendoIA] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ tablas: TablaCreada[]; hojasOmitidas: string[] } | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [planActivo, setPlanActivo] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = crearClienteBrowser();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: miembro } = await supabase.from("miembros").select("empresa_id").eq("user_id", user!.id).single();
      if (!miembro) return;
      setEmpresaId(miembro.empresa_id);
      setPlanActivo(await tieneSuscripcionActiva(supabase, miembro.empresa_id));
    })();
  }, []);

  async function onArchivoElegido(file: File | null) {
    setArchivo(file);
    setGrupos(null);
    setResultado(null);
    setError(null);
    if (!file) return;

    const form = new FormData();
    form.append("archivo", file);
    const res = await fetch("/api/upload/grupos", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? "No se pudo leer el archivo");

    setGrupos(body.grupos);
    setHojasOmitidas(body.hojasOmitidas ?? []);
    setEdiciones((body.grupos as GrupoDetectado[]).map(aEdicion));
  }

  function cambiarGrupo(i: number, parche: Partial<EdicionGrupo>) {
    setEdiciones((eds) => eds.map((e, j) => (j === i ? { ...e, ...parche } : e)));
  }

  function cambiarColumna(gi: number, key: string, parche: Partial<EdicionGrupo["columnas"][number]>) {
    setEdiciones((eds) =>
      eds.map((e, j) => (j !== gi ? e : { ...e, columnas: e.columnas.map((c) => (c.key === key ? { ...c, ...parche } : c)) }))
    );
  }

  async function sugerirConIA(gi: number) {
    if (!archivo || !empresaId) return;
    setSugiriendoIA(gi);
    setError(null);
    const form = new FormData();
    form.append("archivo", archivo);
    form.append("grupoIndex", String(gi));
    form.append("empresaId", empresaId);
    const res = await fetch("/api/upload/sugerir-ia", { method: "POST", body: form });
    const body = await res.json();
    setSugiriendoIA(null);
    if (!res.ok) return setError(body.error ?? "No se pudo obtener la sugerencia de IA");
    const sugeridas: { key: string; label: string; rol: string | null }[] = body.columnas;
    cambiarGrupo(gi, {
      columnas: ediciones[gi].columnas.map((c) => {
        const s = sugeridas.find((x) => x.key === c.key);
        return s ? { ...c, label: s.label, rol: (s.rol ?? "") as RolColumna | "" } : c;
      }),
    });
  }

  async function onConfirmar() {
    if (!archivo) return;
    setCargando(true);
    setError(null);

    const supabase = crearClienteBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: miembro } = await supabase.from("miembros").select("empresa_id").eq("user_id", user!.id).single();

    const form = new FormData();
    form.append("archivo", archivo);
    form.append("empresaId", miembro!.empresa_id);
    form.append(
      "seleccion",
      JSON.stringify(
        ediciones.map((e) => ({
          incluir: e.incluir,
          nombre: e.nombre,
          columnas: e.columnas.map((c) => ({ key: c.key, label: c.label, rol: c.rol || null })),
        }))
      )
    );

    const res = await fetch("/api/upload/auto", { method: "POST", body: form });
    const body = await res.json();
    setCargando(false);

    if (!res.ok) return setError(body.error ?? "Error procesando el archivo");
    setResultado(body);
    setGrupos(null);
  }

  const hayIncluidos = ediciones.some((e) => e.incluir);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Crear módulos</h1>
          <p className="suave" style={{ maxWidth: "62ch" }}>
            Sube tu Excel: detectamos las hojas que se parecen y te proponemos hasta 3 módulos. Revisa cada uno,
            elige cuáles quieres cargar y confirma qué significa cada columna antes de crear nada.
          </p>
        </div>
      </div>

      {!grupos && !resultado && (
        <div className="tarjeta" style={{ maxWidth: 760 }}>
          <label htmlFor="archivo-auto">Tu archivo de Excel</label>
          <input
            id="archivo-auto"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => onArchivoElegido(e.target.files?.[0] ?? null)}
          />
          {error && <p className="alerta alerta-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
        </div>
      )}

      {grupos && (
        <>
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          {hojasOmitidas.length > 0 && (
            <p className="alerta alerta-aviso">
              No se pudieron agrupar (había más de 3 estructuras distintas): {hojasOmitidas.join(", ")}. Puedes
              importarlas a mano desde <Link href="/dashboard/upload">Subir 1 hoja</Link>.
            </p>
          )}

          {grupos.map((g, gi) => {
            const ed = ediciones[gi];
            return (
              <div key={gi} className="tarjeta" style={{ marginBottom: 20, opacity: ed.incluir ? 1 : 0.55 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}>
                    <input type="checkbox" checked={ed.incluir} onChange={(e) => cambiarGrupo(gi, { incluir: e.target.checked })} />
                    <input
                      value={ed.nombre}
                      onChange={(e) => cambiarGrupo(gi, { nombre: e.target.value })}
                      maxLength={120}
                      style={{ fontWeight: 700 }}
                      aria-label={`Nombre del módulo ${gi + 1}`}
                    />
                  </label>
                  <span className="suave pequeno">{g.filasCount} filas, de: {g.hojas.join(", ")}</span>
                </div>

                {g.confuso && ed.incluir && (
                  <p className="alerta alerta-aviso" style={{ marginTop: 14 }}>
                    No reconocimos bien esta estructura.{" "}
                    {planActivo ? (
                      <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={() => sugerirConIA(gi)} disabled={sugiriendoIA === gi}>
                        {sugiriendoIA === gi ? "Pensando..." : "Sugerir con IA"}
                      </button>
                    ) : (
                      <>
                        Puedes revisar y elegir las columnas a mano abajo, o{" "}
                        <Link href="/dashboard/billing">activa el plan pago</Link> para que la IA te la sugiera.
                      </>
                    )}
                  </p>
                )}

                {ed.incluir && (
                  <div style={{ marginTop: 14 }}>
                    {ed.columnas.map((c) => (
                      <div key={c.key} className="fila-columna" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1.4fr)" }}>
                        <input
                          value={c.label}
                          maxLength={60}
                          onChange={(e) => cambiarColumna(gi, c.key, { label: e.target.value })}
                          aria-label={`Nombre de la columna ${c.key}`}
                        />
                        <select
                          value={c.rol}
                          onChange={(e) => cambiarColumna(gi, c.key, { rol: e.target.value as RolColumna | "" })}
                          aria-label={`Qué significa ${c.label || c.key}`}
                        >
                          <option value="">Sin significado especial</option>
                          {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="centrado" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primario btn-grande" onClick={onConfirmar} disabled={cargando || !hayIncluidos}>
              {cargando ? "Creando..." : `Crear ${ediciones.filter((e) => e.incluir).length} módulo(s)`}
            </button>
          </div>
        </>
      )}

      {resultado && (
        <div className="tarjeta tarjeta-elevada" style={{ maxWidth: 760, marginTop: 20 }}>
          <h2 style={{ fontSize: 22 }}>
            Listo: se {resultado.tablas.length === 1 ? "creó 1 módulo" : `crearon ${resultado.tablas.length} módulos`}
          </h2>
          <div className="grilla-tablas" style={{ marginTop: 14 }}>
            {resultado.tablas.map((t) => (
              <Link key={t.datasetId} href={`/dashboard/${t.datasetId}`} className="tarjeta tarjeta-tabla">
                <h3>{t.nombre}</h3>
                <p className="suave pequeno" style={{ margin: 0 }}>
                  {t.filasImportadas} filas, de: {t.hojas.join(", ")}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
