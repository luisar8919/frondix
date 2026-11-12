import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import type { Columna } from "@/lib/excel-parser";
import type { Regla } from "@/lib/reglas";

// Todos los módulos de la empresa que tienen algo que mostrar en la pantalla
// de Reglas: al menos UN campo ya mapeado (cualquier rol, no solo "Estado" --
// Monto, Cantidad, Stock mínimo, el que sea sirve de condición ahora) para
// armar condiciones nuevas, o ya tienen al menos una regla guardada (ej.
// "ajustar_stock", que no depende de ningún campo mapeado). El resto de
// módulos (sin ningún significado marcado) no aparece acá.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const { data: datasets, error } = await supabase
    .from("datasets")
    .select("id, nombre, columnas, reglas")
    .eq("empresa_id", sesion.empresaId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const modulos = (datasets ?? [])
    .map((d) => ({ datasetId: d.id as string, nombre: d.nombre as string, columnas: d.columnas as Columna[], reglas: (d.reglas as Regla[]) ?? [] }))
    .filter((m) => m.reglas.length > 0 || m.columnas.some((c) => c.rol !== null));

  return NextResponse.json({ modulos });
}
