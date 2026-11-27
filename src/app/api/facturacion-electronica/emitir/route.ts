import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { emitirComprobante } from "@/lib/factpro";

// Emite un comprobante real ante SUNAT (vía FactPro) para UNA venta completa
// del Punto de Venta -- se llama UNA sola vez por venta/cobro (con TODAS las
// líneas del carrito, o del subconjunto si es "Cobrar seleccionadas", como
// items), ANTES de guardar los registros de Ventas, para poder tagearlos con
// el serie/número real que devuelve FactPro. "Nota de venta" nunca llama acá.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const { tipo, cliente, items, incluyeTax } = await req.json().catch(() => ({}));
  if (tipo !== "boleta" && tipo !== "factura") return NextResponse.json({ error: "tipo debe ser boleta o factura" }, { status: 400 });
  if (!cliente?.numeroDocumento?.trim() || !cliente?.denominacion?.trim()) {
    return NextResponse.json({ error: "Falta el documento o el nombre del cliente" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "Faltan los ítems de la venta" }, { status: 400 });
  // Factura es siempre a RUC (11 dígitos); Boleta acepta DNI (8) o RUC.
  if (tipo === "factura" && cliente.numeroDocumento.trim().length !== 11) {
    return NextResponse.json({ error: "Una Factura necesita el RUC (11 dígitos) del cliente" }, { status: 400 });
  }

  const { data: empresa } = await supabase
    .from("empresas")
    .select("factpro_token, factpro_serie_factura, factpro_serie_boleta")
    .eq("id", sesion.empresaId)
    .single();
  if (!empresa?.factpro_token) {
    return NextResponse.json({ error: "La facturación electrónica no está activada para esta empresa -- actívala en Mi Empresa." }, { status: 400 });
  }
  const serie = tipo === "factura" ? empresa.factpro_serie_factura : empresa.factpro_serie_boleta;
  if (!serie) return NextResponse.json({ error: `No hay una serie de ${tipo} configurada todavía.` }, { status: 400 });

  try {
    const resultado = await emitirComprobante(
      empresa.factpro_token,
      serie,
      {
        tipoDocumento: cliente.numeroDocumento.trim().length === 11 ? "4" : "1",
        numeroDocumento: cliente.numeroDocumento.trim(),
        denominacion: cliente.denominacion.trim(),
        direccion: cliente.direccion,
      },
      (items as { descripcion: string; cantidad: number; precio: number }[]).map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio: i.precio,
        incluyeTax: incluyeTax ?? true,
      }))
    );
    // FactPro no documenta públicamente la forma exacta de esta respuesta --
    // "mejor esfuerzo" para extraer serie/número, nunca falla la emisión en sí
    // por no encontrar el campo (eso ya pasó arriba, con éxito real).
    const numero = resultado?.numero ?? resultado?.documento?.numero ?? null;
    return NextResponse.json({ ok: true, serie, numero });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al emitir el comprobante en FactPro" }, { status: 500 });
  }
}
