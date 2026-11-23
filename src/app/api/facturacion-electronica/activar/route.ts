import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";
import { crearEmpresa, crearSerie, crearSucursal, listarSucursales, FACTPRO_TIPO_DOCUMENTO } from "@/lib/factpro";

// Onboarding completo de facturación electrónica para UNA empresa: crea el RUC
// en FactPro, su sucursal principal y las 2 series (factura/boleta), y guarda
// todo en `empresas`. Queda en entorno demo -- pasar a producción es un paso
// aparte (cambiarEntorno), porque antes el dueño tiene que hacer el Alta de PSE
// en SUNAT con su propia clave SOL (Frondix nunca pide esa clave), y SUNAT
// recién la activa al día siguiente.
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });
  const empresaId = sesion.empresaId;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: miMembresia } = await supabase.from("miembros").select("rol").eq("empresa_id", empresaId).eq("user_id", user!.id).single();
  if (!miMembresia || (miMembresia.rol !== "dueno" && miMembresia.rol !== "admin")) {
    return NextResponse.json({ error: "Solo el dueño o un admin pueden activar la facturación electrónica" }, { status: 403 });
  }

  const { ruc, direccion, ubigeoId, nombreComercial } = await req.json().catch(() => ({}));
  if (!ruc || !direccion || !ubigeoId) {
    return NextResponse.json({ error: "Faltan datos: ruc, direccion, ubigeoId" }, { status: 400 });
  }

  const { data: empresa } = await supabase.from("empresas").select("nombre, factpro_token").eq("id", empresaId).single();
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  if (empresa.factpro_token) return NextResponse.json({ error: "La facturación electrónica ya está activada para esta empresa" }, { status: 400 });

  try {
    const creada = await crearEmpresa(ruc, empresa.nombre, nombreComercial);
    const tokenEmpresa = creada.token as string;

    let sucursales = await listarSucursales(tokenEmpresa);
    if (sucursales.length === 0) {
      await crearSucursal(tokenEmpresa, { codigoAnexo: "0000", direccion, ubigeoId });
      sucursales = await listarSucursales(tokenEmpresa);
    }
    const sucursalId = String(sucursales[0].id);

    const serieFactura = "F001";
    const serieBoleta = "B001";
    await crearSerie(tokenEmpresa, FACTPRO_TIPO_DOCUMENTO.factura, serieFactura, sucursalId);
    await crearSerie(tokenEmpresa, FACTPRO_TIPO_DOCUMENTO.boleta, serieBoleta, sucursalId);

    const { error } = await supabase
      .from("empresas")
      .update({ ruc, factpro_token: tokenEmpresa, factpro_serie_factura: serieFactura, factpro_serie_boleta: serieBoleta })
      .eq("id", empresaId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, serieFactura, serieBoleta });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al activar FactPro" }, { status: 500 });
  }
}
