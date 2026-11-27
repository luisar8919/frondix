import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { empresaDelUsuarioServidor } from "@/lib/sesionServidor";

// Consulta DNI/RUC vía apis.net.pe para autocompletar el cliente al emitir
// boleta/factura desde el Punto de Venta -- server-side para no exponer el
// token al navegador. Requiere APISNET_TOKEN (apis.net.pe/app, token gratis
// con límite bajo o un plan pago si hace falta más volumen).
//
// NUNCA PROBADO CON UN TOKEN REAL todavía -- los nombres de endpoint/campos de
// abajo son los documentados públicamente (api.apis.net.pe/v2/reniec/dni y
// /v2/sunat/ruc, parámetro "numero", header Authorization: Bearer <token>) al
// momento de escribir esto, pero apis.net.pe no publica un contrato formal
// versionado -- si algo cambió, esto va a fallar con un 502 "respondió XXX" en
// vez de silencioso, revisar ahí primero.
export async function GET(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const sesion = await empresaDelUsuarioServidor(supabase);
  if (!sesion.ok) return NextResponse.json({ error: sesion.error }, { status: 401 });

  const tipo = req.nextUrl.searchParams.get("tipo");
  const numero = req.nextUrl.searchParams.get("numero")?.trim();
  if (tipo !== "dni" && tipo !== "ruc") return NextResponse.json({ error: "tipo debe ser dni o ruc" }, { status: 400 });
  if (!numero || !/^\d+$/.test(numero)) return NextResponse.json({ error: "Número de documento inválido" }, { status: 400 });
  if ((tipo === "dni" && numero.length !== 8) || (tipo === "ruc" && numero.length !== 11)) {
    return NextResponse.json({ error: tipo === "dni" ? "El DNI debe tener 8 dígitos" : "El RUC debe tener 11 dígitos" }, { status: 400 });
  }

  const token = process.env.APISNET_TOKEN;
  if (!token) return NextResponse.json({ error: "Falta configurar APISNET_TOKEN en el servidor" }, { status: 500 });

  const path = tipo === "dni" ? "reniec/dni" : "sunat/ruc";
  try {
    const res = await fetch(`https://api.apis.net.pe/v2/${path}?numero=${numero}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return NextResponse.json({ error: "No se encontró ese documento" }, { status: 404 });
    if (!res.ok) return NextResponse.json({ error: `apis.net.pe respondió ${res.status}` }, { status: 502 });
    const body = await res.json();

    if (tipo === "dni") {
      const nombre = [body.nombres, body.apellidoPaterno, body.apellidoMaterno].filter(Boolean).join(" ").trim();
      if (!nombre) return NextResponse.json({ error: "No se encontró ese DNI" }, { status: 404 });
      return NextResponse.json({ nombre });
    }
    if (!body.razonSocial) return NextResponse.json({ error: "No se encontró ese RUC" }, { status: 404 });
    return NextResponse.json({ nombre: body.razonSocial, direccion: body.direccion ?? null });
  } catch {
    return NextResponse.json({ error: "No se pudo conectar con apis.net.pe" }, { status: 502 });
  }
}
