import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { tipoModulo } from "@/lib/roles";
import type { Columna } from "@/lib/excel-parser";

// "Ventas > Registrar" en la barra: si solo tienes un módulo de Ventas, entra
// directo a su formulario de carga; con 0 o varios, cae a /dashboard/ventas
// (ahí ya se puede elegir/expandir el formulario de cada uno, ver
// CategoriaMovimientos.tsx).
export default async function RegistrarVentaPage() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) redirect(sesion.error === "No se pudo identificar tu empresa." ? "/auth/completar" : "/login");

  const { data: datasets } = await supabase.from("datasets").select("id, columnas").eq("empresa_id", sesion.empresaId);
  const deVentas = (datasets ?? []).filter((d) => tipoModulo((d.columnas as Columna[]).map((c) => c.rol)) === "ventas");

  redirect(deVentas.length === 1 ? `/dashboard/${deVentas[0].id}` : "/dashboard/ventas");
}
