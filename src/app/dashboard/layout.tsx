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
  const esVendedor = rol === "vendedor";
  if (sesion.ok) {
    const { data: datasetsCrudos } = await supabase
      .from("datasets")
      .select("id, nombre, columnas")
      .eq("empresa_id", sesion.empresaId)
      .order("created_at", { ascending: false });
    modulos = (datasetsCrudos ?? [])
      .filter((d) => !esVendedor || tipoModulo((d.columnas as Columna[]).map((c) => c.rol), d.nombre) !== "compras")
      .map((d) => ({ id: d.id, nombre: d.nombre }));
  }

  return (
    <>
      <RegistrarPush />
      <BarraPanel rol={rol} modulos={modulos} />
      <main className="contenedor panel">{children}</main>
    </>
  );
}
