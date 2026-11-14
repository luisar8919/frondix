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

  const todos = (datasets ?? []).map((d) => ({ id: d.id as string, nombre: d.nombre as string, columnas: d.columnas as Columna[] }));

  // Lo mismo que datasetStockDe()/esStock() en stock.ts (servidor, no se puede
  // importar directo porque necesita el cliente de Supabase) -- si este módulo
  // tiene una columna Producto enlazada a un dataset que "parece" Stock, puede
  // ofrecer "Ajustar Stock automáticamente" como acción seleccionable, no solo
  // como algo que el sistema crea solo al enlazar. Devuelve el detalle real
  // (tipo ventas/compras, a qué Stock le pega, qué columna de Cantidad usa) para
  // que la UI lo muestre armado con su propia estructura, no solo un título.
  function infoAjustarStock(columnas: Columna[], nombre: string) {
    const tipo = tipoModulo(columnas.map((c) => c.rol), nombre);
    if (tipo === "otro") return null;
    const cProducto = columnas.find((c) => c.rol === "producto" && c.enlace && claveValida(c.enlace.columnaKey));
    if (!cProducto?.enlace) return null;
    const stockDs = todos.find((d) => d.id === cProducto.enlace!.datasetId);
    if (!stockDs || !esStock(stockDs.columnas)) return null;
    const cCantidad = columnas.find((c) => c.rol === "cantidad");
    return { tipoModulo: tipo as "ventas" | "compras", stockNombre: stockDs.nombre, cantidadLabel: cCantidad?.label ?? null };
  }

  // Candidatos para "Sumar/fijar un campo enlazado" (generaliza ajustar_stock
  // a cualquier campo de cualquier módulo enlazado, ej. sumar 1 a "Visitas"
  // en Clientes por cada venta, o fijar "Último estado" en el Pedido
  // enlazado): por cada columna de ESTE módulo que tenga un enlace, los
  // campos de texto o número del dataset al que apunta -- "sumar" solo tiene
  // sentido si el objetivo es numérico (la UI lo restringe con tipoObjetivo).
  function candidatosSumarCampo(columnas: Columna[]) {
    const candidatos: {
      columnaEnlaceKey: string; columnaEnlaceLabel: string; columnaObjetivoKey: string; columnaObjetivoLabel: string;
      datasetObjetivoNombre: string; tipoObjetivo: "numero" | "texto"; opcionesObjetivo: string[] | null;
    }[] = [];
    for (const c of columnas) {
      if (!c.enlace || !claveValida(c.enlace.columnaKey)) continue;
      const destino = todos.find((d) => d.id === c.enlace!.datasetId);
      if (!destino) continue;
      for (const objetivo of destino.columnas) {
        if (objetivo.tipo !== "numero" && objetivo.tipo !== "texto") continue;
        candidatos.push({
          columnaEnlaceKey: c.key,
          columnaEnlaceLabel: c.label,
          columnaObjetivoKey: objetivo.key,
          columnaObjetivoLabel: objetivo.label,
          datasetObjetivoNombre: destino.nombre,
          tipoObjetivo: objetivo.tipo,
          opcionesObjetivo: objetivo.opcionesFijas ?? null,
        });
      }
    }
    return candidatos;
  }

  const modulos = (datasets ?? [])
    .map((d) => ({
      datasetId: d.id as string,
      nombre: d.nombre as string,
      columnas: d.columnas as Columna[],
      reglas: (d.reglas as Regla[]) ?? [],
      ajustarStockInfo: infoAjustarStock(d.columnas as Columna[], d.nombre as string),
      hayTelefono: (d.columnas as Columna[]).some((c) => c.rol === "telefono"),
      hayCliente: (d.columnas as Columna[]).some((c) => c.rol === "cliente"),
      candidatosSumarCampo: candidatosSumarCampo(d.columnas as Columna[]),
    }))
    .filter((m) => m.reglas.length > 0 || m.columnas.some((c) => c.rol !== null) || m.ajustarStockInfo);

  return NextResponse.json({ modulos });
}
