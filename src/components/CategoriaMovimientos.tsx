"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Barra from "@/components/Barra";
import DynamicForm from "@/components/DynamicForm";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import { tipoModulo, type TipoModulo } from "@/lib/roles";
import type { Columna } from "@/lib/excel-parser";

interface TotalMes { mes: string; total: number; registros: number }
interface RankingItem { clave: string; total: number; veces: number }
interface FlujoCaja { ventas: number; costos: number; igv: number; gananciaBruta: number; gananciaNeta: number }
interface ModuloReporte {
  datasetId: string;
  nombre: string;
  totalesPorMes: TotalMes[] | null;
  topProducto: RankingItem[] | null;
  topCliente: RankingItem[] | null;
  topProveedor: RankingItem[] | null;
  sumaTotal: number | null;
  sumaGastos: number | null;
  flujoCaja: FlujoCaja | null;
}

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const nombreMes = (clave: string) => {
  const [anio, mes] = clave.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
};

// Compras y Ventas son la misma pantalla con distinto filtro: qué módulos
// mostrar (según sus roles, ver lib/roles.ts) y qué parte del registro ya
// calculado (/api/reportes) tiene sentido para cada uno. No son un tipo de
// módulo nuevo -- son los mismos módulos de siempre, vistos por separado.
export default function CategoriaMovimientos({ tipo }: { tipo: TipoModulo }) {
  const [cargando, setCargando] = useState(true);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [modulos, setModulos] = useState<{ datasetId: string; nombre: string; columnas: Columna[]; reporte?: ModuloReporte }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [mensajeRegistro, setMensajeRegistro] = useState<Record<string, string>>({});

  const [creandoTabla, setCreandoTabla] = useState(false);
  const [nombreTabla, setNombreTabla] = useState("");
  const [errorTabla, setErrorTabla] = useState<string | null>(null);
  const [enviandoTabla, setEnviandoTabla] = useState(false);

  async function cargar() {
    const supabase = crearClienteBrowser();
    const sesion = await empresaDelUsuario(supabase);
    if (!sesion.ok) {
      setError(sesion.error);
      return setCargando(false);
    }
    setEmpresaId(sesion.empresaId);

    const { data: datasets } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", sesion.empresaId);
    const delTipo = (datasets ?? []).filter((d) => tipoModulo((d.columnas as Columna[]).map((c) => c.rol)) === tipo);

    const resReportes = await fetch("/api/reportes");
    const bodyReportes = await resReportes.json();
    const reportesPorId = new Map<string, ModuloReporte>((bodyReportes.modulos ?? []).map((m: ModuloReporte) => [m.datasetId, m]));

    setModulos(
      delTipo.map((d) => ({
        datasetId: d.id,
        nombre: d.nombre,
        columnas: d.columnas as Columna[],
        reporte: reportesPorId.get(d.id),
      }))
    );
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  async function registrar(datasetId: string, valores: Record<string, unknown>): Promise<string | null> {
    const res = await fetch(`/api/records/${datasetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valores),
    });
    const body = await res.json();
    if (!res.ok) return body.error ?? "No se pudo guardar";
    setMensajeRegistro((m) => ({ ...m, [datasetId]: "Guardado." }));
    return null;
  }

  async function crearTabla(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId) return;
    setErrorTabla(null);
    setEnviandoTabla(true);
    const res = await fetch("/api/datasets/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, tipo, nombre: nombreTabla }),
    });
    const body = await res.json();
    setEnviandoTabla(false);
    if (!res.ok) return setErrorTabla(body.error ?? "No se pudo crear la tabla");
    setCreandoTabla(false);
    setNombreTabla("");
    setCargando(true);
    cargar();
  }

  if (cargando) return null;

  const titulo = tipo === "compras" ? "Compras" : "Ventas";
  const sustantivo = tipo === "compras" ? "compra" : "venta";
  const contraparte = tipo === "compras" ? "proveedor" : "cliente";

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>{titulo}</h1>
          <p className="suave">
            Registra una {sustantivo} a tu {contraparte} y mira los reportes de este grupo, por separado de lo demás.
          </p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}

      {!error && modulos.length === 0 && (
        <div className="tarjeta vacio">
          <h2 style={{ fontSize: 22 }}>Todavía no hay módulos de {titulo.toLowerCase()}</h2>
          <p>
            Sube un Excel y marca una columna como {tipo === "compras" ? "Proveedor" : "Cliente"} en &quot;Editar
            tabla y campos&quot;, o arma una tabla en blanco con los campos ya listos para empezar a registrar a mano.
          </p>
          <div className="centrado" style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/dashboard/upload" className="btn btn-secundario">Subir Excel</Link>
            <button type="button" className="btn btn-primario" onClick={() => setCreandoTabla(true)}>
              Crear tabla de {titulo} desde plantilla
            </button>
          </div>
        </div>
      )}

      {!error && modulos.length > 0 && !creandoTabla && (
        <button type="button" className="btn btn-fantasma" style={{ marginBottom: 16 }} onClick={() => setCreandoTabla(true)}>
          + Otra tabla de {titulo} desde plantilla
        </button>
      )}

      {creandoTabla && (
        <form onSubmit={crearTabla} className="tarjeta" style={{ marginBottom: 20, maxWidth: 420 }}>
          <h3 style={{ marginTop: 0 }}>Nueva tabla de {titulo}</h3>
          <p className="suave pequeno" style={{ marginBottom: 10 }}>
            Arranca con las columnas típicas de {tipo === "compras" ? "una compra" : "una venta"}
            {" "}(Fecha, {tipo === "compras" ? "Proveedor" : "Cliente"}, Producto, Monto
            {tipo === "ventas" ? ", Costo" : ""}, Gastos de {sustantivo}): puedes agregar, quitar o renombrar
            columnas después, en &quot;Editar tabla y campos&quot;.
          </p>
          <div className="campo" style={{ marginBottom: 10 }}>
            <label htmlFor="nombre-tabla">Nombre (opcional)</label>
            <input id="nombre-tabla" value={nombreTabla} onChange={(e) => setNombreTabla(e.target.value)} placeholder={titulo} />
          </div>
          {errorTabla && <p className="alerta alerta-error" role="alert">{errorTabla}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-primario" disabled={enviandoTabla}>
              {enviandoTabla ? "Creando..." : "Crear tabla"}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={() => setCreandoTabla(false)} disabled={enviandoTabla}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {modulos.map((m) => {
        const r = m.reporte;
        const maxMes = Math.max(1, ...(r?.totalesPorMes?.map((x) => x.total) ?? [0]));
        const topContraparte = tipo === "compras" ? r?.topProveedor : r?.topCliente;

        return (
          <section key={m.datasetId} className="tarjeta" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0 }}>{m.nombre}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href={`/dashboard/${m.datasetId}`} className="btn btn-fantasma" style={{ padding: "4px 12px" }}>
                  Ver módulo completo
                </Link>
                <button
                  type="button"
                  className="btn btn-secundario"
                  style={{ padding: "4px 12px" }}
                  onClick={() => setRegistrando(registrando === m.datasetId ? null : m.datasetId)}
                >
                  + Registrar {sustantivo}
                </button>
              </div>
            </div>

            {registrando === m.datasetId && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <DynamicForm
                  key={m.datasetId}
                  columnas={m.columnas}
                  textoBoton={`Registrar ${sustantivo}`}
                  onSubmit={(valores) => registrar(m.datasetId, valores)}
                />
                {mensajeRegistro[m.datasetId] && (
                  <p className="alerta alerta-ok" role="status" style={{ marginTop: 10 }}>{mensajeRegistro[m.datasetId]}</p>
                )}
              </div>
            )}

            {r?.flujoCaja && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Flujo de caja</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
                  <div><p className="suave pequeno" style={{ margin: 0 }}>Ventas</p><p style={{ margin: 0, fontWeight: 600 }}>{soles(r.flujoCaja.ventas)}</p></div>
                  <div><p className="suave pequeno" style={{ margin: 0 }}>Costos</p><p style={{ margin: 0, fontWeight: 600 }}>{soles(r.flujoCaja.costos)}</p></div>
                  <div><p className="suave pequeno" style={{ margin: 0 }}>Ganancia Neta</p><p style={{ margin: 0, fontWeight: 700, color: "var(--verde-700)" }}>{soles(r.flujoCaja.gananciaNeta)}</p></div>
                </div>
              </div>
            )}

            {r?.sumaTotal !== null && r?.sumaTotal !== undefined && !r?.flujoCaja && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Total</strong>
                <p style={{ margin: "6px 0 0" }}>{soles(r.sumaTotal)}</p>
              </div>
            )}

            {r?.sumaGastos !== null && r?.sumaGastos !== undefined && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Gastos adicionales de {sustantivo}</strong>
                <p className="suave pequeno" style={{ margin: "2px 0 0" }}>Envío, comisión u otro gasto aparte del monto.</p>
                <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{soles(r.sumaGastos)}</p>
              </div>
            )}

            {r?.totalesPorMes && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>{tipo === "compras" ? "Gasto por mes" : "Ventas por mes"} (últimos 6 meses)</strong>
                <div style={{ marginTop: 10 }}>
                  {r.totalesPorMes.map((t) => (
                    <Barra key={t.mes} valor={t.total} maximo={maxMes} etiqueta={nombreMes(t.mes)} texto={soles(t.total)} />
                  ))}
                </div>
              </div>
            )}

            {tipo === "ventas" && r?.topProducto && r.topProducto.length > 0 && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Top 5 productos</strong>
                <div style={{ marginTop: 10 }}>
                  {(() => {
                    const max = Math.max(1, ...r.topProducto!.map((x) => x.total || x.veces));
                    return r.topProducto!.map((p) => (
                      <Barra key={p.clave} valor={p.total || p.veces} maximo={max} etiqueta={p.clave.length > 12 ? p.clave.slice(0, 11) + "…" : p.clave} texto={p.total > 0 ? soles(p.total) : `${p.veces}x`} />
                    ));
                  })()}
                </div>
              </div>
            )}

            {topContraparte && topContraparte.length > 0 && (
              <div className="tarjeta" style={{ marginTop: 14, padding: 14 }}>
                <strong>Top 5 {tipo === "compras" ? "proveedores" : "clientes"}</strong>
                <div style={{ marginTop: 10 }}>
                  {(() => {
                    const max = Math.max(1, ...topContraparte!.map((x) => x.total || x.veces));
                    return topContraparte!.map((c) => (
                      <Barra key={c.clave} valor={c.total || c.veces} maximo={max} etiqueta={c.clave.length > 12 ? c.clave.slice(0, 11) + "…" : c.clave} texto={c.total > 0 ? soles(c.total) : `${c.veces}x`} />
                    ));
                  })()}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
