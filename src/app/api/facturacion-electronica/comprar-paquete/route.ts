import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { crearCargo } from "@/lib/culqi";
import { agregarPaqueteExtra, PAQUETES_FACTURACION } from "@/lib/limiteFacturacion";

// Compra un paquete extra de comprobantes para el mes en curso. `tokenTarjeta`
// viene del lado del cliente (Culqi.js tokeniza la tarjeta antes de llegar acá --
// esta ruta nunca ve el número de tarjeta real).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  const empresaId = sesion.empresaId;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: miMembresia } = await supabase.from("miembros").select("rol").eq("empresa_id", empresaId).eq("user_id", user!.id).single();
  if (!miMembresia || (miMembresia.rol !== "dueno" && miMembresia.rol !== "admin")) {
    return NextResponse.json({ error: "Solo el dueño o un admin pueden comprar esto" }, { status: 403 });
  }

  const { tamano, tokenTarjeta } = await req.json().catch(() => ({}));
  const precioSoles = PAQUETES_FACTURACION[tamano as keyof typeof PAQUETES_FACTURACION];
  if (!precioSoles || !tokenTarjeta) {
    return NextResponse.json({ error: "Faltan datos: tamano (50 o 200), tokenTarjeta" }, { status: 400 });
  }

  try {
    await crearCargo(user!.email!, tokenTarjeta, precioSoles * 100);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo procesar el pago" }, { status: 500 });
  }

  await agregarPaqueteExtra(supabase, empresaId, tamano);
  return NextResponse.json({ ok: true });
}
