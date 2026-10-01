"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TotalMes { mes: string; total: number; registros: number }
interface RankingItem { clave: string; total: number; veces: number }
interface FlujoCaja { ventas: number; costos: number; igv: number; gananciaBruta: number; gananciaNeta: number }
interface Modulo {
  datasetId: string;
  nombre: string;
  totalesPorMes: TotalMes[] | null;
  topProducto: RankingItem[] | null;
  topCliente: RankingItem[] | null;
  sumaTotal: number | null;
  flujoCaja: FlujoCaja | null;
}

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const nombreMes = (clave: string) => {
  const [anio, mes] = clave.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
};

// Una barra hecha con CSS (sin librería de gráficos): un div cuyo ancho es el
// porcentaje del máximo del grupo. Simple y ligero, acorde al resto del panel.
function Barra({ valor, maximo, etiqueta, texto }: { valor: number; maximo: number; etiqueta: string; texto: string }) {
  const porcentaje = maximo > 0 ? Math.max(4, Math.round((valor / maximo) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span className="suave pequeno">{etiqueta}</span>
      <div style={{ background: "var(--verde-100)", borderRadius: 4, height: 20 }}>
        <div style={{ width: `${porcentaje}%`, background: "var(--verde-600)", height: "100%", borderRadius: 4 }} />
      </div>
      <span className="pequeno" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{texto}</span>
    </div>
  );
}

export default function ReportesPage() {
  const [modulos, setModulos] = useState<Modulo[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reportes")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudieron cargar los reportes");
        setModulos(body.modulos);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Reportes</h1>
          <p className="suave">Vistas automáticas de tus módulos, según lo que marcaste al subir el Excel (monto, fecha, producto, cliente).</p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!modulos && !error && <p className="suave">Cargando...</p>}

      {modulos && modulos.length === 0 && (
        <div className="tarjeta">
          <h3>Todavía no hay reportes</h3>
          <p className="suave">
            Necesitas al menos un módulo con columnas marcadas como Monto, Producto o Cliente. Puedes
            agregar esos significados desde &quot;Editar tabla y campos&quot; en cualquier módulo, o al subir un Excel nuevo.
          </p>
          <Link href="/dashboard" className="btn btn-primario">Ver mis módulos</Link>
        </div>
      )}

      {modulos?.map((m) => {
        const maxMes = Math.max(1, ...(m.totalesPorMes?.map((x) => x.total) ?? [0]));
        return (
          <section key={m.datasetId} className="tarjeta" style={{ marginBottom: 20 }}>
            <h3>{m.nombre}</h3>

            {m.flujoCaja && (
              <div style={{ marginTop: 10 }}>
                <p className="suave pequeno" style={{ marginBottom: 10 }}>Flujo de caja</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>Ventas</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{soles(m.flujoCaja.ventas)}</p>
                  </div>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>Costos</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{soles(m.flujoCaja.costos)}</p>
                  </div>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>IGV (18%)</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{soles(m.flujoCaja.igv)}</p>
                  </div>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>Ganancia Bruta</p>
                    <p style={{ margin: 0, fontWeight: 600 }}>{soles(m.flujoCaja.gananciaBruta)}</p>
                  </div>
                  <div>
                    <p className="suave pequeno" style={{ margin: 0 }}>Ganancia Neta</p>
                    <p style={{ margin: 0, fontWeight: 700, color: "var(--verde-700)" }}>{soles(m.flujoCaja.gananciaNeta)}</p>
                  </div>
                </div>
                <p className="ayuda" style={{ marginTop: 8 }}>
                  {m.flujoCaja.gananciaBruta === m.flujoCaja.gananciaNeta
                    ? "Tus ventas no incluyen IGV (o no lo marcaste en \"Editar tabla y campos\"): el IGV se suma aparte, no se resta de la ganancia."
                    : "Tus ventas ya incluyen IGV: se descontó de la ganancia bruta para calcular la neta, porque ese monto no es tuyo, es de SUNAT."}
                </p>
              </div>
            )}

            {m.sumaTotal !== null && (
              <p style={{ marginTop: 10 }}>
                Total: <strong>{soles(m.sumaTotal)}</strong>
                <span className="suave pequeno" style={{ marginLeft: 6 }}>(no tiene columna de fecha para mostrarlo por mes)</span>
              </p>
            )}

            {m.totalesPorMes && (
              <div style={{ marginTop: 14 }}>
                <p className="suave pequeno" style={{ marginBottom: 10 }}>Total por mes (últimos 6 meses)</p>
                {m.totalesPorMes.map((t) => (
                  <Barra key={t.mes} valor={t.total} maximo={maxMes} etiqueta={nombreMes(t.mes)} texto={soles(t.total)} />
                ))}
              </div>
            )}

            {m.topProducto && m.topProducto.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p className="suave pequeno" style={{ marginBottom: 10 }}>Top 5 productos</p>
                {(() => {
                  const max = Math.max(1, ...m.topProducto.map((x) => x.total || x.veces));
                  return m.topProducto.map((p) => (
                    <Barra
                      key={p.clave}
                      valor={p.total || p.veces}
                      maximo={max}
                      etiqueta={p.clave.length > 12 ? p.clave.slice(0, 11) + "…" : p.clave}
                      texto={p.total > 0 ? soles(p.total) : `${p.veces}x`}
                    />
                  ));
                })()}
              </div>
            )}

            {m.topCliente && m.topCliente.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p className="suave pequeno" style={{ marginBottom: 10 }}>Top 5 clientes</p>
                {(() => {
                  const max = Math.max(1, ...m.topCliente.map((x) => x.total || x.veces));
                  return m.topCliente.map((c) => (
                    <Barra
                      key={c.clave}
                      valor={c.total || c.veces}
                      maximo={max}
                      etiqueta={c.clave.length > 12 ? c.clave.slice(0, 11) + "…" : c.clave}
                      texto={c.total > 0 ? soles(c.total) : `${c.veces}x`}
                    />
                  ));
                })()}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
