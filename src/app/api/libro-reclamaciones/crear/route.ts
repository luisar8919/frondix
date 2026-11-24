import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarCorreoAlCliente } from "@/lib/email";
import { ipDePeticion, limitePorIp } from "@/lib/limiteIp";

// Publico, sin sesion -- lo llama el formulario de /libro-reclamaciones
// (Libro de Reclamaciones Virtual, requisito INDECOPI D.S. 101-2022-PCM).
// Guarda el reclamo/queja con el cliente admin (la tabla no tiene policies,
// ver migracion-41) y le genera al consumidor un codigo unico para que pueda
// hacerle seguimiento -- eso es lo que exige la ley, no solo "recibimos tu
// mensaje". Tambien avisa por correo al dueno de la plataforma, mismo patron
// que agendar-reunion.
function generarCodigo(): string {
  return "RC-" + crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

const CAMPOS_OBLIGATORIOS = [
  "tipo", "nombre", "apellido", "documentoTipo", "documentoNumero",
  "domicilio", "correo", "bienContratado", "descripcion", "pedido",
] as const;

export async function POST(req: NextRequest) {
  if (!limitePorIp(ipDePeticion(req), 10)) {
    return NextResponse.json({ error: "Demasiadas peticiones, intenta mas tarde" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  for (const campo of CAMPOS_OBLIGATORIOS) {
    if (!body[campo] || !String(body[campo]).trim()) {
      return NextResponse.json({ error: `Falta completar "${campo}"` }, { status: 400 });
    }
  }
  if (!["reclamo", "queja"].includes(body.tipo)) {
    return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.correo))) {
    return NextResponse.json({ error: "Correo invalido" }, { status: 400 });
  }
  if (body.esMenorEdad && !String(body.tutorNombre ?? "").trim()) {
    return NextResponse.json({ error: "Falta el nombre del padre, madre o tutor" }, { status: 400 });
  }

  const admin = crearClienteAdmin();
  const codigo = generarCodigo();
  const { error } = await admin.from("libro_reclamaciones").insert({
    codigo,
    tipo: body.tipo,
    nombre: String(body.nombre).slice(0, 200),
    apellido: String(body.apellido).slice(0, 200),
    documento_tipo: String(body.documentoTipo).slice(0, 20),
    documento_numero: String(body.documentoNumero).slice(0, 20),
    domicilio: String(body.domicilio).slice(0, 300),
    telefono: body.telefono ? String(body.telefono).slice(0, 30) : null,
    correo: String(body.correo).slice(0, 200),
    es_menor_edad: !!body.esMenorEdad,
    tutor_nombre: body.esMenorEdad ? String(body.tutorNombre).slice(0, 200) : null,
    bien_contratado: String(body.bienContratado).slice(0, 300),
    monto: body.monto ? Number(body.monto) || null : null,
    descripcion: String(body.descripcion).slice(0, 4000),
    pedido: String(body.pedido).slice(0, 2000),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const destinatarios = (process.env.LANDING_NOTIFICACION_EMAIL || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (destinatarios.length > 0) {
    const cuerpo = [
      `Nuevo ${body.tipo === "reclamo" ? "reclamo" : "queja"} en el Libro de Reclamaciones (codigo ${codigo}).`,
      `De: ${body.nombre} ${body.apellido} (${body.correo}${body.telefono ? ", " + body.telefono : ""})`,
      `Bien contratado: ${body.bienContratado}`,
      `Detalle: ${body.descripcion}`,
      `Pedido del consumidor: ${body.pedido}`,
    ].join("<br>");
    await enviarCorreoAlCliente(destinatarios[0], "Frondix", cuerpo);
  }

  return NextResponse.json({ ok: true, codigo });
}
