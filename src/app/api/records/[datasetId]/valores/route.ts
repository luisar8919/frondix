import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { claveValida } from "@/lib/enlaces";
import type { Columna } from "@/lib/excel-parser";
import { esStock } from "@/lib/stock";

// Valores distintos de una columna: sirven de lista de opciones para las columnas
// enlazadas. Se leen por páginas (Supabase corta en 1000 filas) hasta un tope.
const PAGINA = 1000;
const TOPE_FILAS = 20000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ datasetId: string }> }) {
  const { datasetId } = await params;
  const columna = req.nextUrl.searchParams.get("columna");
  if (!claveValida(columna)) return NextResponse.json({ error: "Columna inválida" }, { status: 400 });

  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Si este dataset (típicamente un Stock) tiene columnas de precio, se
  // devuelven junto a los valores -- así DynamicForm puede autocompletar el
  // Monto al elegir un producto existente (ver componente), sin otro viaje
  // al servidor por cada selección.
  const { data: ds } = await supabase.from("datasets").select("columnas").eq("id", datasetId).single();
  const dsColumnas = (ds?.columnas as Columna[] | undefined) ?? [];
  const cGeneral = dsColumnas.find((c) => c.rol === "monto");
  const cMayorista = dsColumnas.find((c) => c.rol === "precio_mayorista");
  const cMinorista = dsColumnas.find((c) => c.rol === "precio_minorista");
  const hayPrecios = !!(cGeneral || cMayorista || cMinorista);
  // Si este dataset también tiene un código de barras/SKU (rol "codigo"), se
  // devuelve el mapa código->valor para que el Punto de Venta pueda, al
  // escanear, encontrar el producto sin que el cajero lo busque en la grilla.
  const cCodigo = dsColumnas.find((c) => c.rol === "codigo");
  const hayCodigo = !!cCodigo;
  // Si el dataset enlazado es un Stock de verdad (ver esStock, misma regla
  // que usa el resto del proyecto: columna "producto" + clave "cantidad"),
  // se devuelve también cuánto queda de cada producto -- el Punto de Venta
  // lo usa para apagar los que ya no tienen stock, en vez de dejarlos
  // tocables como si quedara.
  const esStockDataset = esStock(dsColumnas);

  const distintos = new Set<string>();
  const precios: Record<string, { general?: number; mayorista?: number; minorista?: number }> = {};
  const codigos: Record<string, string> = {};
  const cantidades: Record<string, number> = {};
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await supabase
      .from("records")
      .select(hayPrecios || hayCodigo || esStockDataset ? "data" : `v:data->>${columna}`)
      .eq("dataset_id", datasetId)
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (hayPrecios || hayCodigo || esStockDataset) {
      for (const fila of data as unknown as { data: Record<string, unknown> }[]) {
        const v = String(fila.data[columna] ?? "").trim();
        if (!v) continue;
        distintos.add(v);
        const p: { general?: number; mayorista?: number; minorista?: number } = {};
        if (cGeneral) { const n = Number(fila.data[cGeneral.key]); if (Number.isFinite(n)) p.general = n; }
        if (cMayorista) { const n = Number(fila.data[cMayorista.key]); if (Number.isFinite(n)) p.mayorista = n; }
        if (cMinorista) { const n = Number(fila.data[cMinorista.key]); if (Number.isFinite(n)) p.minorista = n; }
        if (Object.keys(p).length) precios[v] = p;
        if (cCodigo) {
          const codigo = String(fila.data[cCodigo.key] ?? "").trim();
          if (codigo) codigos[codigo] = v;
        }
        if (esStockDataset) {
          const n = Number(fila.data.cantidad);
          if (Number.isFinite(n)) cantidades[v] = n;
        }
      }
    } else {
      for (const fila of data as unknown as { v: string | null }[]) {
        const v = fila.v?.trim();
        if (v) distintos.add(v);
      }
    }
    if (data.length < PAGINA) break;
  }

  return NextResponse.json({ valores: [...distintos].sort((a, b) => a.localeCompare(b, "es")), precios, codigos, cantidades });
}
