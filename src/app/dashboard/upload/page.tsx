"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { empresaDelUsuario } from "@/lib/sesion";
import { ROLES, type RolColumna } from "@/lib/roles";
import { PLANTILLAS_REPORTE, plantillasCubiertas, rolesFaltantes } from "@/lib/plantillasReporte";
import type { Columna } from "@/lib/excel-parser";

const etiquetaRol = Object.fromEntries(ROLES.map((r) => [r.valor, r.etiqueta.split(" (")[0]]));

interface GrupoDetectado {
  hojas: string[];
  nombreSugerido: string;
  columnas: Columna[];
  filasCount: number;
  filasVaciasDescartadas: number;
  confuso: boolean;
  muestra: Record<string, unknown>[];
}

// Estado editable de cada grupo/pestaña: si se incluye, su nombre y el label/rol de cada columna.
interface EdicionGrupo {
  incluir: boolean;
  nombre: string;
  columnas: { key: string; label: string; rol: RolColumna | "" }[];
  // Si esta tabla tiene columna de Producto, el usuario puede pedir que además se
  // cree un módulo "Stock" (Producto + Cantidad en 0, una fila por producto distinto).
  crearStock: boolean;
  // Si esta tabla tiene columna de Tipo de movimiento, el usuario puede pedir que
  // se divida en dos módulos (Ventas y Compras) en vez de uno mixto.
  dividir: boolean;
  // Si esta tabla tiene columnas de Monto y Costo en la MISMA fila (sin Tipo que
  // las distinga -- cada venta ya trae su costo de adquisición), el usuario puede
  // pedir separarla en Ventas y Compras en vez de una venta con un costo adentro.
  separar: boolean;
}

interface ModuloCreado {
  datasetId: string;
  nombre: string;
  hojas: string[];
  filasImportadas: number;
}

// Dos pistas simples por el nombre de la pestaña: si parece un reporte ya armado
// (Frondix ya arma eso solo, en Reportes) o si parece un inventario (Stock), para
// sugerir -- sin armarlo automáticamente, es solo un aviso -- que se puede alimentar
// cruzando los productos que ya se vendieron en Ventas.
const pareceReporte = (hojas: string[]) => hojas.find((h) => /reporte|resumen|dashboard|kpi/i.test(h));
const pareceStock = (hojas: string[]) => hojas.find((h) => /stock|inventario/i.test(h));

const aEdicion = (g: GrupoDetectado): EdicionGrupo => {
  const roles = g.columnas.map((c) => c.rol);
  const tieneTipo = roles.includes("tipo_movimiento");
  const tieneMontoYCosto = roles.includes("monto") && roles.includes("costo");
  return {
    // Un reporte ya armado no hace falta cargarlo (Frondix arma ese mismo resumen
    // solo, en Reportes): se deja desmarcado por defecto, el usuario lo puede marcar igual.
    incluir: !pareceReporte(g.hojas),
    nombre: g.nombreSugerido,
    columnas: g.columnas.map((c) => ({ key: c.key, label: c.label, rol: (c.rol ?? "") as RolColumna | "" })),
    // Con columna de Producto ya hay con qué armar un Stock enlazado -- se crea
    // por defecto, el usuario lo puede desmarcar si de verdad no lo necesita.
    crearStock: roles.includes("producto"),
    // Si la tabla ya trae de qué distinguir Ventas de Compras (columna Tipo, o
    // Monto+Costo juntos en la misma fila), separarla por defecto es lo que casi
    // siempre se quiere -- el usuario lo puede desmarcar si de verdad prefiere un
    // solo módulo mixto.
    dividir: tieneTipo,
    separar: !tieneTipo && tieneMontoYCosto,
  };
};

export default function UploadPage() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<GrupoDetectado[] | null>(null);
  const [hojasOmitidas, setHojasOmitidas] = useState<string[]>([]);
  const [ediciones, setEdiciones] = useState<EdicionGrupo[]>([]);
  const [pestanaActiva, setPestanaActiva] = useState(0);
  const [sugiriendoIA, setSugiriendoIA] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ tablas: ModuloCreado[]; avisos?: string[] } | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [planActivo, setPlanActivo] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = crearClienteBrowser();
    (async () => {
      const r = await empresaDelUsuario(supabase);
      if (!r.ok) return; // silencioso al cargar la página; se vuelve a chequear (con aviso) al confirmar
      setEmpresaId(r.empresaId);
      setPlanActivo(await tieneSuscripcionActiva(supabase, r.empresaId));
    })();
  }, []);

  async function onArchivoElegido(file: File | null) {
    setArchivo(file);
    setGrupos(null);
    setResultado(null);
    setError(null);
    setPestanaActiva(0);
    if (!file) return;

    try {
      const form = new FormData();
      form.append("archivo", file);
      const res = await fetch("/api/upload/grupos", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "No se pudo leer el archivo");

      setGrupos(body.grupos);
      setHojasOmitidas(body.hojasOmitidas ?? []);
      setEdiciones((body.grupos as GrupoDetectado[]).map(aEdicion));
    } catch {
      setError("No se pudo leer el archivo. Revisa tu conexión e intenta de nuevo.");
    }
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
    try {
      const form = new FormData();
      form.append("archivo", archivo);
      form.append("grupoIndex", String(gi));
      form.append("empresaId", empresaId);
      const res = await fetch("/api/upload/sugerir-ia", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "No se pudo obtener la sugerencia de IA");
      const sugeridas: { key: string; label: string; rol: string | null }[] = body.columnas;
      cambiarGrupo(gi, {
        columnas: ediciones[gi].columnas.map((c) => {
          const s = sugeridas.find((x) => x.key === c.key);
          return s ? { ...c, label: s.label, rol: (s.rol ?? "") as RolColumna | "" } : c;
        }),
      });
    } catch {
      setError("No se pudo obtener la sugerencia de IA. Intenta de nuevo.");
    } finally {
      setSugiriendoIA(null);
    }
  }

  async function onConfirmar() {
    if (!archivo) return;
    setCargando(true);
    setError(null);

    try {
      const supabase = crearClienteBrowser();
      const sesion = await empresaDelUsuario(supabase);
      if (!sesion.ok) return setError(sesion.error);

      const form = new FormData();
      form.append("archivo", archivo);
      form.append("empresaId", sesion.empresaId);
      form.append(
        "seleccion",
        JSON.stringify(
          ediciones.map((e) => ({
            incluir: e.incluir,
            nombre: e.nombre,
            columnas: e.columnas.map((c) => ({ key: c.key, label: c.label, rol: c.rol || null })),
            crearStock: e.crearStock,
            dividir: e.dividir,
            separar: e.separar,
          }))
        )
      );

      // Sin esto, un servidor que nunca contesta (cuelgue, timeout silencioso) deja el
      // botón en "Creando..." para siempre: a los 30 s se cancela sola y avisa.
      const controlador = new AbortController();
      const limite = setTimeout(() => controlador.abort(), 30000);
      let res: Response;
      try {
        res = await fetch("/api/upload/auto", { method: "POST", body: form, signal: controlador.signal });
      } finally {
        clearTimeout(limite);
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? `El servidor no pudo procesar el archivo (código ${res.status}). Si es un archivo grande, prueba dividirlo en partes.`);
      setResultado(body);
      setGrupos(null);
    } catch (e) {
      setError(e instanceof DOMException && e.name === "AbortError"
        ? "El servidor tardó demasiado en responder (más de 30 s) y se canceló. Intenta de nuevo o avisa si sigue pasando."
        : "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  const hayIncluidos = ediciones.some((e) => e.incluir);
  const g = grupos?.[pestanaActiva];
  const ed = ediciones[pestanaActiva];

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Subir Excel</h1>
          <p className="suave" style={{ maxWidth: "62ch" }}>
            Sube tu archivo: detectamos las hojas que se parecen y te proponemos un módulo por cada una. Revisa
            cada pestaña, elige cuáles quieres cargar y confirma qué significa cada columna antes de crear nada.
          </p>
        </div>
      </div>

      {!grupos && !resultado && (
        <div className="tarjeta" style={{ maxWidth: 760 }}>
          <label htmlFor="archivo">Tu archivo de Excel</label>
          <input
            id="archivo"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => onArchivoElegido(e.target.files?.[0] ?? null)}
          />
          <p className="ayuda">Formatos: .xlsx, .xls o .csv</p>
          {error && <p className="alerta alerta-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
        </div>
      )}

      {grupos && g && ed && (
        <>
          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          {hojasOmitidas.length > 0 && (
            <p className="alerta alerta-aviso">
              No se pudieron agrupar (había más de 3 estructuras distintas): {hojasOmitidas.join(", ")}.
            </p>
          )}

          <div role="tablist" aria-label="Módulos detectados" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {grupos.map((grupo, gi) => (
              <button
                key={gi}
                type="button"
                role="tab"
                aria-selected={gi === pestanaActiva}
                onClick={() => setPestanaActiva(gi)}
                className={`btn ${gi === pestanaActiva ? "btn-primario" : "btn-secundario"}`}
                style={{ opacity: ediciones[gi].incluir ? 1 : 0.5, display: "flex", alignItems: "center", gap: 8 }}
              >
                <input
                  type="checkbox"
                  checked={ediciones[gi].incluir}
                  onChange={(e) => {
                    e.stopPropagation();
                    cambiarGrupo(gi, { incluir: e.target.checked });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Incluir ${ediciones[gi].nombre}`}
                />
                {ediciones[gi].nombre || `Módulo ${gi + 1}`}
              </button>
            ))}
          </div>

          <div className="tarjeta" style={{ marginBottom: 16, opacity: ed.incluir ? 1 : 0.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div className="campo" style={{ margin: 0, maxWidth: 320 }}>
                <label htmlFor="nombre-modulo">Nombre del módulo</label>
                <input
                  id="nombre-modulo"
                  value={ed.nombre}
                  onChange={(e) => cambiarGrupo(pestanaActiva, { nombre: e.target.value })}
                  maxLength={120}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={ed.incluir} onChange={(e) => cambiarGrupo(pestanaActiva, { incluir: e.target.checked })} />
                Cargar este módulo
              </label>
              <span className="suave pequeno">{g.filasCount} filas, de: {g.hojas.join(", ")}</span>
            </div>

            {g.filasVaciasDescartadas > 0 && ed.incluir && (
              <p className="suave pequeno" style={{ marginTop: 10 }}>
                Ojo: dejamos fuera {g.filasVaciasDescartadas === 1 ? "1 fila que estaba" : `${g.filasVaciasDescartadas} filas que estaban`} completamente vacía{g.filasVaciasDescartadas === 1 ? "" : "s"} en el Excel.
                No pasa nada, no se van a cargar y así tu tabla queda limpia.
              </p>
            )}

            {pareceReporte(g.hojas) && (
              <p className="alerta alerta-aviso" style={{ marginTop: 14 }}>
                La pestaña &quot;{pareceReporte(g.hojas)}&quot; parece ser un reporte ya armado (no datos sueltos de
                cada venta). Frondix arma ese mismo tipo de resumen solo, a partir de tus ventas, en la pestaña
                Reportes — por eso la dejamos sin marcar para cargar. Puedes marcarla igual si de verdad la
                quieres como tabla.
              </p>
            )}

            {ed.incluir && !pareceReporte(g.hojas) && pareceStock(g.hojas) && (
              <p className="alerta alerta-aviso" style={{ marginTop: 14 }}>
                Detectamos una pestaña de Stock. También se puede armar cruzando los productos que ya vendiste
                en tus módulos de Ventas (cuántas unidades de cada uno).
              </p>
            )}

            {ed.incluir && ed.columnas.some((c) => c.rol === "tipo_movimiento") && (
              <div className="alerta alerta-aviso" style={{ marginTop: 14 }}>
                <p style={{ margin: 0 }}>
                  Esta tabla parece mezclar ventas y compras en las mismas filas. Se puede dividir en dos módulos
                  (Ventas y Compras) en vez de uno solo -- de paso, a cada venta le completamos el costo con el
                  monto de la compra más reciente del mismo producto, cuando la venta no traía uno propio.
                </p>
                <button
                  type="button"
                  className={`btn ${ed.dividir ? "btn-primario" : "btn-secundario"}`}
                  style={{ marginTop: 10, padding: "4px 14px" }}
                  onClick={() => cambiarGrupo(pestanaActiva, { dividir: !ed.dividir })}
                >
                  {ed.dividir ? "✓ Se va a dividir en Ventas y Compras" : "Dividir en Ventas y Compras"}
                </button>
              </div>
            )}

            {ed.incluir &&
              !ed.columnas.some((c) => c.rol === "tipo_movimiento") &&
              ed.columnas.some((c) => c.rol === "monto") &&
              ed.columnas.some((c) => c.rol === "costo") && (
                <div className="alerta alerta-aviso" style={{ marginTop: 14 }}>
                  <p style={{ margin: 0 }}>
                    Cada fila de esta tabla trae tanto el monto de venta como el costo de adquisición juntos. Se
                    puede separar en dos módulos: Ventas (producto, monto, cliente si hay, cantidad) y Compras
                    (producto, costo como monto, proveedor si hay, cantidad). Sin columna de cantidad, se usa 1
                    por fila.
                  </p>
                  <button
                    type="button"
                    className={`btn ${ed.separar ? "btn-primario" : "btn-secundario"}`}
                    style={{ marginTop: 10, padding: "4px 14px" }}
                    onClick={() => cambiarGrupo(pestanaActiva, { separar: !ed.separar })}
                  >
                    {ed.separar ? "✓ Se va a separar en Ventas y Compras" : "Separar en Ventas y Compras"}
                  </button>
                </div>
              )}

            {ed.incluir && !pareceReporte(g.hojas) && !pareceStock(g.hojas) && ed.columnas.some((c) => c.rol === "producto") && (
              <div className="alerta alerta-aviso" style={{ marginTop: 14 }}>
                <p style={{ margin: 0 }}>
                  Como esta tabla tiene columna de Producto, también puedes crear un módulo de Stock con esos
                  productos (la cantidad empieza en 0, tú la editas después). Queda enlazado al Producto de esta tabla.
                </p>
                <button
                  type="button"
                  className={`btn ${ed.crearStock ? "btn-primario" : "btn-secundario"}`}
                  style={{ marginTop: 10, padding: "4px 14px" }}
                  onClick={() => cambiarGrupo(pestanaActiva, { crearStock: !ed.crearStock })}
                >
                  {ed.crearStock ? "✓ Se va a crear el módulo Stock" : "+ Crear también un módulo Stock"}
                </button>
              </div>
            )}

            {g.confuso && ed.incluir && (
              <p className="alerta alerta-aviso" style={{ marginTop: 14 }}>
                No reconocimos bien esta estructura.{" "}
                {planActivo ? (
                  <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={() => sugerirConIA(pestanaActiva)} disabled={sugiriendoIA === pestanaActiva}>
                    {sugiriendoIA === pestanaActiva ? "Pensando..." : "Sugerir con IA"}
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
                <h3 style={{ fontSize: 16, marginBottom: 10 }}>Revisa las columnas</h3>
                {ed.columnas.map((c) => {
                  const sospechosa = g.columnas.find((gc) => gc.key === c.key)?.sospechosa;
                  return (
                    <div key={c.key} style={{ marginBottom: sospechosa ? 6 : 0 }}>
                      <div className="fila-columna" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1.4fr)" }}>
                        <input
                          value={c.label}
                          maxLength={60}
                          onChange={(e) => cambiarColumna(pestanaActiva, c.key, { label: e.target.value })}
                          aria-label={`Nombre de la columna ${c.key}`}
                        />
                        <select
                          value={c.rol}
                          onChange={(e) => cambiarColumna(pestanaActiva, c.key, { rol: e.target.value as RolColumna | "" })}
                          aria-label={`Qué significa ${c.label || c.key}`}
                        >
                          <option value="">Sin significado especial</option>
                          {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
                        </select>
                      </div>
                      {sospechosa && (
                        <p className="suave pequeno" style={{ margin: "4px 0 0" }}>
                          Aquí no estamos muy seguros del nombre, ¿le echas un vistazo? Puedes escribir el que prefieras arriba.
                        </p>
                      )}
                    </div>
                  );
                })}
                <p className="ayuda">
                  Indica qué significa cada columna (monto, fecha, cliente...) para que el asistente pueda
                  armarte resúmenes y avisos. Puedes dejarlas sin significado especial.
                </p>

                {(() => {
                  const roles = ed.columnas.map((c) => c.rol);
                  const cubiertas = plantillasCubiertas(roles);
                  const idsCubiertas = new Set(cubiertas.map((p) => p.id));
                  const aUnPaso = PLANTILLAS_REPORTE.filter((p) => {
                    if (idsCubiertas.has(p.id)) return false;
                    const faltan = rolesFaltantes(p, roles);
                    return faltan.length > 0 && faltan.length < p.rolesNecesarios.length;
                  });
                  if (cubiertas.length === 0 && aUnPaso.length === 0) return null;
                  return (
                    <div style={{ marginTop: 18 }}>
                      <h3 style={{ fontSize: 16, marginBottom: 10 }}>Reportes que se van a armar con esto</h3>
                      {cubiertas.map((p) => (
                        <p key={p.id} className="pequeno" style={{ margin: "4px 0" }}>
                          <strong style={{ color: "var(--verde-700)" }}>✓ {p.nombre}</strong>
                          <span className="suave"> — {p.descripcion}</span>
                        </p>
                      ))}
                      {aUnPaso.map((p) => (
                        <p key={p.id} className="suave pequeno" style={{ margin: "4px 0" }}>
                          {p.nombre} — falta marcar una columna como {rolesFaltantes(p, roles).map((r) => etiquetaRol[r]).join(" o ")}.
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {ed.incluir && g.muestra.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>Así se ve lo que se va a cargar</h3>
              <div className="tabla-envoltura" style={{ maxHeight: 260 }}>
                <table>
                  <thead>
                    <tr>
                      {ed.columnas.map((c) => <th key={c.key}>{c.label || c.key}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {g.muestra.map((fila, i) => (
                      <tr key={i}>
                        {ed.columnas.map((c) => {
                          const v = fila[c.key];
                          const texto = v && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : String(v ?? "");
                          return <td key={c.key}>{texto}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {g.filasCount > g.muestra.length && (
                <p className="suave pequeno" style={{ marginTop: 8 }}>
                  Mostrando {g.muestra.length} de {g.filasCount} filas.
                </p>
              )}
            </div>
          )}

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
          {resultado.avisos && resultado.avisos.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {resultado.avisos.map((a, i) => <p key={i} className="alerta alerta-aviso">{a}</p>)}
            </div>
          )}
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
