import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { tipoModulo } from "@/lib/roles";
import type { Columna } from "@/lib/excel-parser";

// Espejo de /dashboard/ventas/registrar, para Compras.
export default async function RegistrarCompraPage() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) redirect(sesion.error === "No se pudo identificar tu empresa." ? "/auth/completar" : "/login");

  const { data: datasets } = await supabase.from("datasets").select("id, nombre, columnas").eq("empresa_id", sesion.empresaId);
  const deCompras = (datasets ?? []).filter((d) => tipoModulo((d.columnas as Columna[]).map((c) => c.rol), d.nombre) === "compras");

  redirect(deCompras.length === 1 ? `/dashboard/${deCompras[0].id}` : "/dashboard/compras");
}
