import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { rolEnEmpresa } from "@/lib/permisos";
import { tipoModulo } from "@/lib/roles";
import BarraPanel from "@/components/BarraPanel";
import RegistrarPush from "@/components/RegistrarPush";
import type { Columna } from "@/lib/excel-parser";

// Protege todo /dashboard sin depender del middleware (que Azure Static Web Apps
// no ejecuta). Las páginas que leen datos del servidor validan la sesión además
// de esto, porque un layout no frena el render de la página en paralelo.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sesion = await empresaDelUsuarioServidor(supabase);
  const rol = sesion.ok ? rolEnEmpresa(sesion.empresas, sesion.empresaId) : undefined;

  // El desplegable "Módulos" de la barra lista exactamente los módulos reales
  // de la empresa -- los mismos que ya se ven como tarjeta en Inicio (ver
  // dashboard/page.tsx), sin agrupar por tipo ni inventar categorías. Un
  // vendedor no ve Compras, mismo criterio que Inicio.
  let modulos: { id: string; nombre: string }[] = [];
  let extras: { href: string; texto: string }[] = [];
  const esVendedor = rol === "vendedor";
  if (sesion.ok) {
    const { data: datasetsCrudos } = await supabase
      .from("datasets")
      .select("id, nombre, columnas")
      .eq("empresa_id", sesion.empresaId)
      .order("created_at", { ascending: false });
    const datasets = (datasetsCrudos ?? []).map((d) => ({ id: d.id, nombre: d.nombre, columnas: d.columnas as Columna[] }));
    modulos = datasets
      .filter((d) => !esVendedor || tipoModulo(d.columnas.map((c) => c.rol), d.nombre) !== "compras")
      .map((d) => ({ id: d.id, nombre: d.nombre }));

    // Clientes/Proveedores/Cotizaciones/Órdenes de compra no son un módulo propio
    // (no tienen tarjeta en Inicio) -- solo se ofrecen en el desplegable una vez
    // que existe al menos UN dato real que los dispare (un cliente con nombre
    // cargado, una cotización creada), nunca solo porque el campo exista vacío
    // en la estructura.
    async function hayValorReal(rolBuscado: string) {
      for (const d of datasets) {
        for (const c of d.columnas) {
          if (c.rol !== rolBuscado) continue;
          const { data } = await supabase
            .from("records")
            .select("id")
            .eq("dataset_id", d.id)
            .not(`data->>${c.key}`, "is", null)
            .neq(`data->>${c.key}`, "")
            .limit(1);
          if (data && data.length > 0) return true;
        }
      }
      return false;
    }
    const [hayClientes, hayProveedores, hayCotizaciones, hayOrdenes] = await Promise.all([
      hayValorReal("cliente"),
      esVendedor ? Promise.resolve(false) : hayValorReal("proveedor"),
      supabase.from("cotizaciones").select("id").eq("empresa_id", sesion.empresaId).limit(1).then((r) => (r.data?.length ?? 0) > 0),
      esVendedor ? Promise.resolve(false) : supabase.from("ordenes_compra").select("id").eq("empresa_id", sesion.empresaId).limit(1).then((r) => (r.data?.length ?? 0) > 0),
    ]);
    extras = [
      hayClientes && { href: "/dashboard/clientes", texto: "Clientes" },
      hayProveedores && { href: "/dashboard/proveedores", texto: "Proveedores" },
      hayCotizaciones && { href: "/dashboard/cotizaciones", texto: "Cotizaciones" },
      hayOrdenes && { href: "/dashboard/ordenes-compra", texto: "Órdenes de compra" },
    ].filter((x): x is { href: string; texto: string } => !!x);
  }

  return (
    <>
      <RegistrarPush />
      <BarraPanel rol={rol} modulos={modulos} extras={extras} />
      <main className="contenedor panel">{children}</main>
    </>
  );
}
