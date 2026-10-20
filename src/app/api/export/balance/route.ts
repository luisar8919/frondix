import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { esVendedor, rolEnEmpresa } from "@/lib/permisos";
import { ultimosMovimientos } from "@/lib/datosReportes";

// Descarga Balance (todos los movimientos de todos los módulos juntos) como
// .xlsx, mismo criterio que /api/export/[datasetId] pero para la vista
// combinada en vez de un solo módulo.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  if (esVendedor(rolEnEmpresa(sesion.empresas, sesion.empresaId))) {
    return NextResponse.json({ error: "Tu rol no tiene acceso a esto" }, { status: 403 });
  }

  const movimientos = await ultimosMovimientos(supabase, sesion.empresaId, 5000);
  const filas = movimientos.map((m) => ({
    Fecha: m.fecha?.slice(0, 10) ?? "",
    Tipo: m.tipo === "venta" ? "Venta" : "Compra",
    Módulo: m.datasetNombre,
    Producto: m.producto ?? "",
    Monto: m.monto ?? "",
    Sustento: m.sustento ?? "",
  }));

  const hoja = XLSX.utils.json_to_sheet(filas, { header: ["Fecha", "Tipo", "Módulo", "Producto", "Monto", "Sustento"] });
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Balance");
  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="balance.xlsx"',
    },
  });
}
