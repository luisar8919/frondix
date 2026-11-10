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
import type { Columna } from "@/lib/excel-parser";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

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
