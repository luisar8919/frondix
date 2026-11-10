import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { rolEnEmpresa } from "@/lib/permisos";
import { tipoModulo } from "@/lib/roles";
import { esStock } from "@/lib/stock";
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

  // El desplegable "Módulos" de la barra solo debe ofrecer lo que la empresa
  // REALMENTE tiene -- antes mostraba Ventas/Compras/Stock/Proveedor/Cliente
  // siempre, aunque la cuenta estuviera vacía. Se detecta igual que el resto
  // del sistema: por tipoModulo/esStock (nunca por nombre de tabla).
  let modulosDisponibles = { ventas: false, compras: false, stock: false, proveedor: false, cliente: false };
  if (sesion.ok) {
    const { data: datasetsCrudos } = await supabase.from("datasets").select("nombre, columnas").eq("empresa_id", sesion.empresaId);
    const datasets = (datasetsCrudos ?? []).map((d) => ({ nombre: d.nombre, columnas: d.columnas as Columna[] }));
    const roles = new Set(datasets.flatMap((d) => d.columnas.map((c) => c.rol)));
    const tipos = new Set(datasets.map((d) => tipoModulo(d.columnas.map((c) => c.rol), d.nombre)));
    modulosDisponibles = {
      ventas: tipos.has("ventas"),
      compras: tipos.has("compras"),
      stock: datasets.some((d) => esStock(d.columnas)),
      proveedor: roles.has("proveedor"),
      cliente: roles.has("cliente"),
    };
  }

  return (
    <>
      <RegistrarPush />
      <BarraPanel rol={rol} modulosDisponibles={modulosDisponibles} />
      <main className="contenedor panel">{children}</main>
    </>
  );
}
