import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { valorizacionInventario } from "@/lib/valorizacionInventario";

// Cuánto dinero hay "parado" en mercadería almacenada, por módulo de Stock y en
// total -- cantidad × el precio de compra más reciente conocido de cada producto.
export async function GET() {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  try {
    const valorizacion = await valorizacionInventario(supabase, sesion.empresaId);
    return NextResponse.json(valorizacion);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo calcular la valorización" }, { status: 500 });
  }
}
