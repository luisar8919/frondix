import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import type { Columna } from "@/lib/excel-parser";

// TODOS los módulos de la empresa (a diferencia de /api/reglas, acá no se
// filtra ninguno: cualquier módulo, tenga o no un campo mapeado, puede
// enlazarse con otro) para la pantalla centralizada /dashboard/enlaces --
// antes esto vivía repetido dentro de cada módulo (ver EnlacesTabla.tsx,
// reusado tal cual acá, una tarjeta por módulo).
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { data: datasets, error } = await supabase
    .from("datasets")
    .select("id, nombre, columnas")
    .eq("empresa_id", sesion.empresaId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    datasets: (datasets ?? []).map((d) => ({ id: d.id as string, nombre: d.nombre as string, columnas: d.columnas as Columna[] })),
  });
}
