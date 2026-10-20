"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import DynamicTable from "@/components/DynamicTable";
import DynamicForm from "@/components/DynamicForm";
import EnlacesTabla from "@/components/EnlacesTabla";
import EditarTabla from "@/components/EditarTabla";
import KardexProducto from "@/components/KardexProducto";
import { enviarConfirmando } from "@/lib/confirmar";
import type { Columna } from "@/lib/excel-parser";
import { filtrarRegistros } from "@/lib/buscar";
import { filtrarPorColumna, relacionesEntrantes, type DatasetResumen } from "@/lib/enlaces";
import { esStock } from "@/lib/stock";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

interface Registro {
  id: string;
  data: Record<string, unknown>;
  sustento?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
}

// Se traen por tramos de 1000 (el máximo que devuelve Supabase por consulta) hasta este
// tope. Con más filas que esto la búsqueda en pantalla dejaría de ser cómoda.
const PAGINA = 1000;
const TOPE_CARGA = 20000;

export default function DatasetPage({
  params,
  searchParams,
}: {
  params: Promise<{ datasetId: string }>;
  searchParams: Promise<{ filtrarCol?: string; filtrarVal?: string }>;
}) {
  const { datasetId } = usePromise(params);
  const { filtrarCol, filtrarVal } = usePromise(searchParams);

  const [dataset, setDataset] = useState<{ id: string; nombre: string; columnas: Columna[]; incluye_igv?: boolean; moneda?: string } | null>(null);
  const [otras, setOtras] = useState<DatasetResumen[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [opciones, setOpciones] = useState<Record<string, string[]>>({});
  const [error, setError] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Registro | null>(null);
  const [errorAccion, setErrorAccion] = useState("");
  // Para el botón "Deshacer" de la edición rápida por doble clic (ver guardarCelda):
  // guarda el valor de ANTES del último cambio, para poder volver a escribirlo.
  const [ultimoCambio, setUltimoCambio] = useState<{ registroId: string; columnaKey: string; columnaLabel: string; valorAnterior: unknown } | null>(null);
  const [esVendedor, setEsVendedor] = useState(false);
  const [escaneando, setEscaneando] = useState(false);

  // Conteo de inventario con la cámara del celular (solo dentro de la app
  // nativa): escanea un código y lo usa como búsqueda de texto -- encuentra el
  // producto sea cual sea la columna donde esté el código (SKU, nombre, etc.),
  // reutilizando el buscador que ya existe en vez de armar un filtro aparte.
  async function escanear() {
    setEscaneando(true);
    try {
      const permiso = await BarcodeScanner.checkPermissions();
      if (permiso.camera !== "granted") {
        const pedido = await BarcodeScanner.requestPermissions();
        if (pedido.camera !== "granted") return;
      }
      const { barcodes } = await BarcodeScanner.scan();
      if (barcodes[0]?.rawValue) setBusqueda(barcodes[0].rawValue);
    } catch {
      // el usuario cerró la cámara o no hay una disponible -- no es un error que avisar
    } finally {
      setEscaneando(false);
    }
  }

  useEffect(() => {
    (async () => {
      const sesion = await empresaDelUsuario(crearClienteBrowser());
      if (sesion.ok) setEsVendedor(sesion.empresas.find((e) => e.empresaId === sesion.empresaId)?.rol === "vendedor");
    })();
  }, []);

  async function cargar() {
    let acumulados: Registro[] = [];
    let totalTabla = 0;
    for (let desde = 0; desde < TOPE_CARGA; desde += PAGINA) {
      const res = await fetch(`/api/records/${datasetId}?desde=${desde}&limite=${PAGINA}`);
      if (!res.ok) return setError(true);
      const body = await res.json();
      if (desde === 0) {
        setDataset(body.dataset);
        setOtras(body.otras ?? []);
        cargarOpciones(body.dataset.columnas);
      }
      totalTabla = body.total;
      acumulados = acumulados.concat(body.records);
      setRegistros(acumulados);
      setTotal(totalTabla);
      if (acumulados.length >= totalTabla || body.records.length < PAGINA) break;
    }
    setCargando(false);
  }

  // Lista de valores permitidos para cada columna enlazada (alimenta el autocompletado).
  async function cargarOpciones(columnas: Columna[]) {
    const entradas = await Promise.all(
      columnas
        .filter((c) => c.enlace)
        .map(async (c) => {
          const res = await fetch(`/api/records/${c.enlace!.datasetId}/valores?columna=${c.enlace!.columnaKey}`);
          return [c.key, res.ok ? ((await res.json()).valores as string[]) : []] as const;
        })
    );
    setOpciones(Object.fromEntries(entradas));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  if (error) {
    return (
      <div className="tarjeta vacio">
        <h2 style={{ fontSize: 24 }}>No pudimos abrir este módulo</h2>
        <p>Puede que no exista o que no tengas acceso.</p>
        <Link href="/dashboard" className="btn btn-primario">Volver a mis módulos</Link>
      </div>
    );
  }
  if (!dataset) return <p className="suave" role="status">Cargando tu módulo...</p>;

  async function agregarRegistro(valores: Record<string, unknown>): Promise<string | null> {
    const res = await fetch(`/api/records/${datasetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valores),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? "No se pudo guardar el registro";
    // Se suma el registro nuevo en pantalla: recargar todo el módulo por cada alta
    // gastaría transferencia (el plan gratis de Supabase da 5 GB al mes).
    setRegistros((anteriores) => [body.record, ...anteriores]);
    setTotal((t) => t + 1);
    // Si el registro trajo un cliente/proveedor/producto nuevo (el formulario deja
    // elegir "+ Agregar nuevo"), ese valor recién se creó en la tabla enlazada --
    // sin esto, el desplegable no lo mostraría hasta recargar toda la página.
    cargarOpciones(dataset!.columnas);
    return null;
  }

  async function guardarEdicion(valores: Record<string, unknown>): Promise<string | null> {
    const r = await enviarConfirmando(`/api/records/${datasetId}/${editando!.id}`, "PATCH", { data: valores });
    if (r.cancelado) return null;
    if (!r.ok) return r.body.error ?? "No se pudo guardar el registro";
    setRegistros((rs) => rs.map((x) => (x.id === r.body.record.id ? { ...x, data: r.body.record.data, updated_by: r.body.record.updated_by, updated_at: r.body.record.updated_at } : x)));
    setEditando(null);
    return null;
  }

  // Edición rápida de un solo campo con doble clic, directo en la tabla (sin abrir
  // el formulario de arriba) -- útil para corregir muchos registros sueltos después
  // de una carga con columnas confusas. `guardarUndo=false` cuando la llamada es el
  // propio botón Deshacer, para no generar un "deshacer del deshacer" en cadena.
  async function guardarCelda(r: Registro, columna: Columna, nuevoValor: unknown, guardarUndo = true): Promise<string | null> {
    const valorAnterior = r.data[columna.key];
    const datos = { ...r.data, [columna.key]: nuevoValor };
    // Corregir la cantidad a mano en un módulo de Stock queda como "ajuste" en
    // el Kardex (ver registrarAjusteManual) -- se pide el motivo acá, antes de
    // guardar, para que ese ajuste no quede sin explicación.
    let motivo: string | undefined;
    if (guardarUndo && dataset && esStock(dataset.columnas) && columna.key === "cantidad" && valorAnterior !== nuevoValor) {
      motivo = window.prompt(`¿Por qué cambia la cantidad de "${r.data[dataset.columnas.find((c) => c.rol === "producto")?.key ?? ""] ?? "este producto"}"? (opcional)`) ?? undefined;
    }
    const res = await enviarConfirmando(`/api/records/${datasetId}/${r.id}`, "PATCH", { data: datos, ...(motivo ? { motivo } : {}) });
    if (res.cancelado) return null;
    if (!res.ok) return res.body.error ?? "No se pudo guardar el cambio";
    setRegistros((rs) => rs.map((x) => (x.id === res.body.record.id ? { ...x, data: res.body.record.data, updated_by: res.body.record.updated_by, updated_at: res.body.record.updated_at } : x)));
    if (guardarUndo) setUltimoCambio({ registroId: r.id, columnaKey: columna.key, columnaLabel: columna.label, valorAnterior });
    return null;
  }

  async function deshacerUltimoCambio() {
    if (!ultimoCambio) return;
    const r = registros.find((x) => x.id === ultimoCambio.registroId);
    const columna = dataset?.columnas.find((c) => c.key === ultimoCambio.columnaKey);
    if (!r || !columna) return setUltimoCambio(null);
    await guardarCelda(r, columna, ultimoCambio.valorAnterior, false);
    setUltimoCambio(null);
  }

  // Sustento contable (boleta/factura, etc.): campo propio del registro, aparte
  // de los datos del Excel -- PATCH directo, sin pasar por las advertencias de
  // enlaces (no tiene nada que ver con eso).
  async function guardarSustento(r: { id: string }, texto: string): Promise<string | null> {
    const res = await fetch(`/api/records/${datasetId}/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sustento: texto }),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? "No se pudo guardar el sustento";
    setRegistros((rs) => rs.map((x) => (x.id === r.id ? { ...x, sustento: body.record.sustento } : x)));
    return null;
  }

  const vacios = registros.filter((r) => Object.values(r.data).every((v) => v === null || v === undefined || v === ""));

  async function eliminarVacios() {
    if (!window.confirm(`¿Eliminar ${vacios.length} registro(s) sin ningún dato cargado? No se puede deshacer.`)) return;
    setErrorAccion("");
    for (const r of vacios) {
      const res = await enviarConfirmando(`/api/records/${datasetId}/${r.id}`, "DELETE");
      if (!res.ok && !res.cancelado) return setErrorAccion(res.body.error ?? "No se pudieron eliminar todos los registros vacíos");
    }
    const idsVacios = new Set(vacios.map((r) => r.id));
    setRegistros((rs) => rs.filter((x) => !idsVacios.has(x.id)));
    setTotal((t) => t - vacios.length);
  }

  async function eliminarRegistro(r: Registro) {
    if (!window.confirm("¿Eliminar este registro? No se puede deshacer.")) return;
    setErrorAccion("");
    const res = await enviarConfirmando(`/api/records/${datasetId}/${r.id}`, "DELETE");
    if (res.cancelado) return;
    if (!res.ok) return setErrorAccion(res.body.error ?? "No se pudo eliminar el registro");
    setRegistros((rs) => rs.filter((x) => x.id !== r.id));
    setTotal((t) => t - 1);
    if (editando?.id === r.id) setEditando(null);
  }

  const etiquetasEnlace = Object.fromEntries(
    dataset.columnas
      .filter((c) => c.enlace)
      .map((c) => {
        const destino = otras.find((d) => d.id === c.enlace!.datasetId);
        const col = destino?.columnas.find((x) => x.key === c.enlace!.columnaKey);
        return [c.key, destino ? `${destino.nombre} > ${col?.label ?? c.enlace!.columnaKey}` : "otro módulo"];
      })
  );

  const filtradas = filtrarPorColumna(registros, filtrarCol, filtrarVal);
  const registrosFiltrados = filtrarRegistros(filtradas, busqueda);
  const colFiltro = dataset.columnas.find((c) => c.key === filtrarCol);
  const incompleta = total > registros.length;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <Link href="/dashboard" className="migas">&larr; Inicio</Link>
          <h1>{dataset.nombre}</h1>
          <p className="suave">
            {total.toLocaleString("es-PE")} {total === 1 ? "registro" : "registros"}
            {cargando && registros.length < total ? ` (cargando ${registros.length.toLocaleString("es-PE")}...)` : ""}
          </p>
        </div>
        {!esVendedor && (
          <div className="acciones">
            <a href={`/api/export/${datasetId}`} className="btn btn-secundario">Descargar Excel</a>
          </div>
        )}
      </div>

      {incompleta && !cargando && (
        <p className="alerta alerta-aviso">
          Este módulo tiene {total.toLocaleString("es-PE")} registros y aquí se muestran los primeros{" "}
          {registros.length.toLocaleString("es-PE")} (los más recientes). La búsqueda solo mira esos.
        </p>
      )}

      <details className="tarjeta plegable" open>
        <summary>Agregar un registro</summary>
        <div className="plegable-cuerpo">
          <DynamicForm
            columnas={dataset.columnas}
            opciones={opciones}
            etiquetasEnlace={etiquetasEnlace}
            onSubmit={agregarRegistro}
          />
        </div>
      </details>

      {editando && (
        <div className="tarjeta" style={{ marginBottom: 20 }}>
          <h3>Editar registro</h3>
          <DynamicForm
            key={editando.id}
            columnas={dataset.columnas}
            opciones={opciones}
            etiquetasEnlace={etiquetasEnlace}
            inicial={editando.data}
            textoBoton="Guardar cambios"
            onSubmit={guardarEdicion}
            onCancelar={() => setEditando(null)}
          />
        </div>
      )}

      {!esVendedor && (
        <>
          <EditarTabla
            key={dataset.columnas.map((c) => c.key + c.label).join("|") + dataset.nombre}
            datasetId={datasetId}
            nombre={dataset.nombre}
            columnas={dataset.columnas}
            incluyeIgv={!!dataset.incluye_igv}
            moneda={dataset.moneda ?? "PEN"}
            onGuardado={cargar}
          />
          <EnlacesTabla datasetId={datasetId} columnas={dataset.columnas} otras={otras} onGuardado={cargar} />

          {esStock(dataset.columnas) && (() => {
            const cProducto = dataset.columnas.find((c) => c.rol === "producto")!;
            const productos = [...new Set(registros.map((r) => r.data[cProducto.key]?.toString().trim()).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, "es"));
            return <KardexProducto datasetId={datasetId} productos={productos} />;
          })()}
        </>
      )}

      {filtrarCol && filtrarVal !== undefined && (
        <p className="alerta alerta-ok">
          Mostrando solo: <strong>{colFiltro?.label ?? filtrarCol}</strong> = <strong>{filtrarVal}</strong>{" "}
          <Link href={`/dashboard/${datasetId}`}>Quitar filtro</Link>
        </p>
      )}

      <div className="buscador">
        <label htmlFor="buscar" className="solo-lectores">Buscar en el módulo</label>
        <input
          id="buscar"
          type="search"
          placeholder="Buscar por cualquier dato..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {esStock(dataset.columnas) && Capacitor.isNativePlatform() && (
          <button type="button" className="btn btn-secundario" onClick={escanear} disabled={escaneando}>
            {escaneando ? "Abriendo cámara..." : "📷 Escanear código"}
          </button>
        )}
        <span className="suave pequeno" aria-live="polite">
          {registrosFiltrados.length.toLocaleString("es-PE")} de {registros.length.toLocaleString("es-PE")}
        </span>
      </div>

      {vacios.length > 0 && (
        <p className="alerta alerta-aviso">
          {vacios.length} {vacios.length === 1 ? "registro está" : "registros están"} completamente vacíos.{" "}
          <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={eliminarVacios}>
            Eliminar vacíos
          </button>
        </p>
      )}

      {errorAccion && <p className="alerta alerta-error" role="alert">{errorAccion}</p>}
      {ultimoCambio && (
        <p className="alerta alerta-ok" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>Cambiaste &quot;{ultimoCambio.columnaLabel}&quot;.</span>
          <button type="button" className="btn btn-fantasma" style={{ padding: "2px 10px" }} onClick={deshacerUltimoCambio}>
            Deshacer
          </button>
        </p>
      )}
      <p className="suave pequeno" style={{ marginBottom: 10 }}>
        Doble clic en una celda para corregirla rápido, sin abrir el formulario.
      </p>
      <DynamicTable
        onEditar={(r) => { setEditando(r); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        onEliminar={eliminarRegistro}
        onEditarCelda={guardarCelda}
        onEditarSustento={guardarSustento}
        columnas={dataset.columnas}
        registros={registrosFiltrados.map((r) => ({ ...r, updatedBy: r.updated_by, updatedAt: r.updated_at }))}
        relacionadas={relacionesEntrantes(otras, datasetId)}
      />
    </>
  );
}
