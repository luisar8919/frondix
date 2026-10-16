import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { rolEnEmpresa } from "@/lib/permisos";
import BarraPanel from "@/components/BarraPanel";
import RegistrarPush from "@/components/RegistrarPush";

// Protege todo /dashboard sin depender del middleware (que Azure Static Web Apps
// no ejecuta). Las páginas que leen datos del servidor validan la sesión además
// de esto, porque un layout no frena el render de la página en paralelo.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sesion = await empresaDelUsuarioServidor(supabase);
  const rol = sesion.ok ? rolEnEmpresa(sesion.empresas, sesion.empresaId) : undefined;

  return (
    <>
      <RegistrarPush />
      <BarraPanel rol={rol} />
      <main className="contenedor panel">{children}</main>
    </>
  );
}
