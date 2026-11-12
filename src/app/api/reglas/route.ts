import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { tipoModulo } from "@/lib/roles";
import { esStock } from "@/lib/stock";
import { claveValida } from "@/lib/enlaces";
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

  const todos = (datasets ?? []).map((d) => ({ id: d.id as string, columnas: d.columnas as Columna[] }));

  // Lo mismo que datasetStockDe()/esStock() en stock.ts (servidor, no se puede
  // importar directo porque necesita el cliente de Supabase) -- si este módulo
  // tiene una columna Producto enlazada a un dataset que "parece" Stock, puede
  // ofrecer "Ajustar Stock automáticamente" como acción seleccionable, no solo
  // como algo que el sistema crea solo al enlazar.
  function puedeAjustarStock(columnas: Columna[], nombre: string): boolean {
    if (tipoModulo(columnas.map((c) => c.rol), nombre) === "otro") return false;
    const cProducto = columnas.find((c) => c.rol === "producto" && c.enlace && claveValida(c.enlace.columnaKey));
    if (!cProducto?.enlace) return false;
    const stockDs = todos.find((d) => d.id === cProducto.enlace!.datasetId);
    return !!stockDs && esStock(stockDs.columnas);
  }

  const modulos = (datasets ?? [])
    .map((d) => ({
      datasetId: d.id as string,
      nombre: d.nombre as string,
      columnas: d.columnas as Columna[],
      reglas: (d.reglas as Regla[]) ?? [],
      puedeAjustarStock: puedeAjustarStock(d.columnas as Columna[], d.nombre as string),
    }))
    .filter((m) => m.reglas.length > 0 || m.columnas.some((c) => c.rol !== null) || m.puedeAjustarStock);

  return NextResponse.json({ modulos });
}
