import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import CuentasPorCobrar from "@/components/CuentasPorCobrar";
import CuentasPorPagar from "@/components/CuentasPorPagar";
import ConsejosInicio from "@/components/ConsejosInicio";
import { rolEnEmpresa } from "@/lib/permisos";
import { tipoModulo, type RolColumna } from "@/lib/roles";
import type { Columna } from "@/lib/excel-parser";

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
    .select("id, nombre, created_at, columnas")
    .eq("empresa_id", sesion.empresaId)
    .order("created_at", { ascending: false });

  const empresa = sesion.empresas.find((e) => e.empresaId === sesion.empresaId)?.nombre ?? "tu negocio";
  const esVendedor = rolEnEmpresa(sesion.empresas, sesion.empresaId) === "vendedor";
  // Un vendedor no ve módulos de Compras (costos, proveedores) -- solo registra
  // ventas y consulta stock, ver src/lib/permisos.ts.
  const datasets = (datasetsCrudos ?? []).filter(
    (d) => !esVendedor || tipoModulo((d.columnas as Columna[]).map((c) => c.rol as RolColumna | null)) !== "compras"
  );
  const hayModulos = datasets.length > 0;

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

      {hayModulos && (
        <div className="grilla-tablas" style={{ marginBottom: 20 }}>
          {datasets.map((d) => (
            <Link key={d.id} href={`/dashboard/${d.id}`} className="tarjeta tarjeta-tabla">
              <div className="icono" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#237a50" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
                  <path d="M2.5 8.5h15M8 8.5v8" />
                </svg>
              </div>
              <h3>{d.nombre}</h3>
              <p className="suave pequeno" style={{ margin: 0 }}>
                Creada el {new Date(d.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </Link>
          ))}
        </div>
      )}

      {hayModulos && <ConsejosInicio />}

      {hayModulos && !esVendedor && <CuentasPorCobrar />}
      {hayModulos && !esVendedor && <CuentasPorPagar />}
    </>
  );
}
