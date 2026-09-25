import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import BarraPanel from "@/components/BarraPanel";

// Protege todo /dashboard sin depender del middleware (que Azure Static Web Apps
// no ejecuta). Las páginas que leen datos del servidor validan la sesión además
// de esto, porque un layout no frena el render de la página en paralelo.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <>
      <BarraPanel />
      <main className="contenedor panel">{children}</main>
    </>
  );
}
