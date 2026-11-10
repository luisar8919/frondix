import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import CuentasPorCobrar from "@/components/CuentasPorCobrar";
import CuentasPorPagar from "@/components/CuentasPorPagar";
import ConsejosInicio from "@/components/ConsejosInicio";
import { rolEnEmpresa } from "@/lib/permisos";
import { tipoModulo, type RolColumna } from "@/lib/roles";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { calcularModulosReporte } from "@/lib/datosReportes";
import { recortarMesesSinDatos } from "@/lib/reportes";
import Barra from "@/components/Barra";
import type { Columna } from "@/lib/excel-parser";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;
const nombreMes = (clave: string) => {
  const [anio, mes] = clave.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
};

export default async function DashboardPage() {
  const supabase = await crearClienteServidor();
  // El middleware no corre en Azure Static Web Apps: la página misma exige la sesión.
  const sesion = await empresaDelUsuarioServidor(supabase);
  // "No se pudo identificar tu empresa" es un usuario YA logueado que nunca
  // terminó de crear su negocio (signup interrumpido, o quedó sin miembros) --
  // mandarlo a /login ahí se veía igual que una contraseña incorrecta, sin
  // ninguna pista real. /auth/completar ya sabe pedirle el nombre del negocio
  // en ese caso (mismo paso que ve alguien que entra con Google por primera vez).
  if (!sesion.ok) redirect(sesion.error === "No se pudo identificar tu empresa." ? "/auth/completar" : "/login");

  const { data: datasetsCrudos } = await supabase
    .from("datasets")
    .select("id, nombre, created_at, columnas, plantilla")
    .eq("empresa_id", sesion.empresaId)
    .order("created_at", { ascending: false });

  const planActivo = await tieneSuscripcionActiva(supabase, sesion.empresaId);
  const empresa = sesion.empresas.find((e) => e.empresaId === sesion.empresaId)?.nombre ?? "tu negocio";
  const esVendedor = rolEnEmpresa(sesion.empresas, sesion.empresaId) === "vendedor";
  // Un vendedor no ve módulos de Compras (costos, proveedores) -- solo registra
  // ventas y consulta stock, ver src/lib/permisos.ts.
  const datasets = (datasetsCrudos ?? []).filter(
    (d) => !esVendedor || tipoModulo((d.columnas as Columna[]).map((c) => c.rol as RolColumna | null), d.nombre) !== "compras"
  );
  const hayModulos = datasets.length > 0;

  // Dashboard de reportería: el plan gratis es para REGISTRAR (Ventas, Compras,
  // Stock, Clientes/Proveedores libres para siempre); este resumen -- ganancia
  // real, qué se vende más -- es lo que distingue al plan pago, reusando el
  // mismo cálculo de /api/reportes (ver src/lib/datosReportes.ts) sin duplicar
  // lógica. Oculto para vendedor, mismo criterio que Cuentas por cobrar/pagar.
  const modulosReporte = hayModulos && !esVendedor && planActivo ? await calcularModulosReporte(supabase, sesion.empresaId) : null;
  // Total de un módulo: sumaTotal y totalesPorMes nunca coexisten (son excluyentes en
  // datosReportes.ts, según tenga o no columna Fecha) -- sumar ambos es seguro.
  const totalModulo = (m: NonNullable<typeof modulosReporte>[number]) =>
    (m.sumaTotal ?? 0) + (m.flujoCaja?.ventas ?? 0) + (m.totalesPorMes?.reduce((s, t) => s + t.total, 0) ?? 0);
  const ventasTotal = modulosReporte?.filter((m) => m.tipo === "ventas").reduce((s, m) => s + totalModulo(m), 0) ?? 0;
  const comprasTotal = modulosReporte?.filter((m) => m.tipo === "compras").reduce((s, m) => s + totalModulo(m), 0) ?? 0;
  const flujoCajaNeta = modulosReporte?.reduce((s, m) => s + (m.flujoCaja?.gananciaNeta ?? 0), 0) ?? 0;
  // Si ningún módulo tiene Flujo de caja armado (necesita Monto + Costo en el mismo
  // módulo), se aproxima la ganancia como Ventas - Compras entre módulos separados.
  const gananciaNeta = flujoCajaNeta !== 0 ? flujoCajaNeta : ventasTotal - comprasTotal;
  const topProductoGlobal = (modulosReporte ?? [])
    .flatMap((m) => m.topProducto ?? [])
    .sort((a, b) => (b.total || b.veces) - (a.total || a.veces))[0];
  const hayDashboard = modulosReporte && (gananciaNeta !== 0 || ventasTotal !== 0 || topProductoGlobal);

  // Evolución en el tiempo (ventas por mes, juntando todos los módulos de Ventas) y
  // comparación por categoría (top productos, juntando todos los módulos) -- los 2
  // tipos de gráfico que de verdad sirven acá, con el mismo componente Barra.tsx que
  // ya usa Reportes (sin agregar una librería de gráficos nueva).
  const mesesPorClave = new Map<string, { total: number; registros: number }>();
  for (const m of modulosReporte ?? []) {
    if (m.tipo !== "ventas") continue;
    for (const t of m.totalesPorMes ?? []) {
      const actual = mesesPorClave.get(t.mes) ?? { total: 0, registros: 0 };
      actual.total += t.total;
      actual.registros += t.registros;
      mesesPorClave.set(t.mes, actual);
    }
  }
  const mesesVentas = recortarMesesSinDatos(
    [...mesesPorClave.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...v }))
  ).slice(-6);
  const maxMes = Math.max(1, ...mesesVentas.map((m) => m.total));

  const productosPorClave = new Map<string, { total: number; veces: number }>();
  for (const m of modulosReporte ?? []) {
    for (const p of m.topProducto ?? []) {
      const actual = productosPorClave.get(p.clave) ?? { total: 0, veces: 0 };
      actual.total += p.total;
      actual.veces += p.veces;
      productosPorClave.set(p.clave, actual);
    }
  }
  const topProductos = [...productosPorClave.entries()]
    .map(([clave, v]) => ({ clave, ...v }))
    .sort((a, b) => (b.total || b.veces) - (a.total || a.veces))
    .slice(0, 5);
  const maxProducto = Math.max(1, ...topProductos.map((p) => p.total || p.veces));

  // Composición por categoría (pastel): genérico, no específico a videojuegos --
  // suma lo que cada negocio ya clasificó en su propia columna "Categoría" (rol
  // categoria), sea cual sea su rubro. Paleta fija de 8 colores, suficiente para
  // el puñado de categorías típico de una pyme; si hay más, el resto cae en gris.
  const PALETA_CATEGORIAS = ["#237a50", "#e8a33d", "#3d7ae8", "#c44d6e", "#7a5de8", "#2db5a8", "#d9802b", "#8c8c8c"];
  const categoriasPorClave = new Map<string, number>();
  for (const m of modulosReporte ?? []) {
    for (const c of m.porCategoria ?? []) {
      categoriasPorClave.set(c.clave, (categoriasPorClave.get(c.clave) ?? 0) + c.total);
    }
  }
  const totalCategorias = [...categoriasPorClave.values()].reduce((s, v) => s + v, 0);
  const categorias = [...categoriasPorClave.entries()]
    .map(([clave, total], i) => ({ clave, total, color: PALETA_CATEGORIAS[i % PALETA_CATEGORIAS.length] }))
    .sort((a, b) => b.total - a.total);
  let acumulado = 0;
  const segmentosPastel = categorias.map((c) => {
    const desde = acumulado;
    acumulado += totalCategorias > 0 ? (c.total / totalCategorias) * 360 : 0;
    return `${c.color} ${desde}deg ${acumulado}deg`;
  });

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>{empresa}</h1>
          <p className="suave">
            {hayModulos ? `${datasets.length} ${datasets.length === 1 ? "módulo" : "módulos"} en tu panel` : "Empecemos por tu primer Excel"}
          </p>
        </div>
        {!esVendedor && (
          <div className="acciones">
            <Link href="/dashboard/upload" className="btn btn-primario">Subir Excel</Link>
          </div>
        )}
      </div>

      {!hayModulos && !esVendedor && (
        <div className="tarjeta tarjeta-elevada vacio">
          <h2 style={{ fontSize: 24 }}>Todavía no hay módulos</h2>
          <p style={{ maxWidth: 46 + "ch", margin: "0 auto 20px" }}>
            Sube el Excel que ya usas: detectamos tus datos y armamos un módulo por cada tipo de información, con formulario de carga y buscador.
          </p>
          <Link href="/dashboard/upload" className="btn btn-primario btn-grande">Subir mi primer Excel</Link>
        </div>
      )}

      {hayModulos && !esVendedor && planActivo && hayDashboard && (
        <div className="tarjeta tarjeta-elevada" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Tu negocio en números</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginTop: 14 }}>
            <div>
              <p className="suave pequeno" style={{ margin: 0 }}>Ventas</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 22 }}>{soles(ventasTotal)}</p>
            </div>
            <div>
              <p className="suave pequeno" style={{ margin: 0 }}>Ganancia neta</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 22, color: "var(--verde-700)" }}>{soles(gananciaNeta)}</p>
            </div>
            {topProductoGlobal && (
              <div>
                <p className="suave pequeno" style={{ margin: 0 }}>Más vendido</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 22 }}>{topProductoGlobal.clave}</p>
              </div>
            )}
          </div>

          {(() => {
            // Cada gráfico es su propio "campo": separador vertical entre ellos (como
            // columnas de una tabla) y título centrado, en vez de quedar todo pegado
            // en un solo grid sin límites visuales entre secciones.
            const campos = [
              mesesVentas.length > 1 && {
                key: "meses",
                titulo: "Ventas por mes",
                contenido: mesesVentas.map((t) => (
                  <Barra key={t.mes} valor={t.total} maximo={maxMes} etiqueta={nombreMes(t.mes)} texto={soles(t.total)} />
                )),
              },
              topProductos.length > 0 && {
                key: "productos",
                titulo: "Top productos",
                contenido: topProductos.map((p) => (
                  <Barra
                    key={p.clave}
                    valor={p.total || p.veces}
                    maximo={maxProducto}
                    etiqueta={p.clave.length > 14 ? p.clave.slice(0, 13) + "…" : p.clave}
                    texto={p.total > 0 ? soles(p.total) : `${p.veces}x`}
                  />
                )),
              },
              categorias.length > 0 && {
                key: "categorias",
                titulo: "Composición por categoría",
                contenido: (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                    <div
                      aria-hidden="true"
                      style={{ width: 88, height: 88, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(${segmentosPastel.join(", ")})` }}
                    />
                    <div style={{ minWidth: 0, textAlign: "left" }}>
                      {categorias.map((c) => (
                        <div key={c.clave} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} aria-hidden="true" />
                          <span className="pequeno" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.clave} <span className="suave">({totalCategorias > 0 ? Math.round((c.total / totalCategorias) * 100) : 0}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              },
            ].filter(Boolean) as { key: string; titulo: string; contenido: React.ReactNode }[];

            return (
              <div style={{ overflowX: "auto", marginTop: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${campos.length}, minmax(220px, 1fr))`, gap: 0, minWidth: campos.length * 220 }}>
                  {campos.map((c, i) => (
                    <div key={c.key} style={{ padding: "0 28px", borderLeft: i > 0 ? "1px solid var(--linea)" : "none" }}>
                      <p className="suave pequeno" style={{ margin: "0 0 12px", textAlign: "center" }}>{c.titulo}</p>
                      {c.contenido}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <p className="suave pequeno" style={{ marginTop: 10 }}>
            Detalle completo (flujo de caja, top 5, metas) en <Link href="/dashboard/reportes">Reportes</Link>.
          </p>
        </div>
      )}

      {hayModulos && !esVendedor && !planActivo && (
        <div className="tarjeta" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Tu negocio en números</h3>
          <p className="suave pequeno" style={{ marginTop: 10 }}>
            Registrar tus ventas, compras y stock es gratis para siempre. Ver tu ganancia real, qué se
            vende más y los módulos adicionales es parte del plan pago.{" "}
            <Link href="/dashboard/billing">Activa tu prueba gratis</Link>.
          </p>
        </div>
      )}

      {hayModulos && (
        <div className="grilla-tablas" style={{ marginBottom: 20 }}>
          {datasets.map((d) => {
            const bloqueado = d.plantilla !== null && !planActivo;
            return (
              <Link key={d.id} href={`/dashboard/${d.id}`} className="tarjeta tarjeta-tabla">
                <div className="icono" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#237a50" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
                    <path d="M2.5 8.5h15M8 8.5v8" />
                  </svg>
                </div>
                <h3>{bloqueado ? "🔒 " : ""}{d.nombre}</h3>
                <p className="suave pequeno" style={{ margin: 0 }}>
                  {bloqueado
                    ? "Bloqueado: activa tu prueba gratis o el plan pago"
                    : `Creada el ${new Date(d.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}`}
                </p>
              </Link>
            );
          })}
        </div>
      )}

      {hayModulos && <ConsejosInicio />}

      {hayModulos && !esVendedor && <CuentasPorCobrar />}
      {hayModulos && !esVendedor && <CuentasPorPagar />}
    </>
  );
}
