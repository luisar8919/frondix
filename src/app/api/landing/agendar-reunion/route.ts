import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarCorreoAlCliente } from "@/lib/email";
import { ipDePeticion, limitePorIp } from "@/lib/limiteIp";

// Publico, sin sesion -- lo llama el formulario de agenda del landing (/, seccion
// "Agenda una reunion"). Guarda la reserva con el cliente admin (la tabla
// reuniones_landing no tiene policies, ver migracion-37) y avisa por correo a
// LANDING_NOTIFICACION_EMAIL -- mejor esfuerzo, igual que el resto de
// email.ts: si esa variable o RESEND_API_KEY no estan configuradas, la
// reserva se guarda igual, solo no llega el aviso.
export async function POST(req: NextRequest) {
  if (!limitePorIp(ipDePeticion(req), 10)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }
  const { nombre, correo, rubro, mensaje, fecha, horario } = await req.json().catch(() => ({}));

  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo))) {
    return NextResponse.json({ error: "Correo invalido" }, { status: 400 });
  }
  if (!fecha || !horario) {
    return NextResponse.json({ error: "Elige un dia y un horario" }, { status: 400 });
  }

  const admin = crearClienteAdmin();
  const { error } = await admin.from("reuniones_landing").insert({
    nombre: nombre ? String(nombre).slice(0, 200) : null,
    correo: String(correo).slice(0, 200),
    rubro: rubro ? String(rubro).slice(0, 200) : null,
    mensaje: mensaje ? String(mensaje).slice(0, 2000) : null,
    fecha: String(fecha).slice(0, 10),
    horario: String(horario).slice(0, 20),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Puede ser 1 o varios correos separados por coma (LANDING_NOTIFICACION_EMAIL).
  const destinatarios = (process.env.LANDING_NOTIFICACION_EMAIL || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (destinatarios.length > 0) {
    const cuerpo = [
      "Nueva reunion agendada desde el landing.",
      `Nombre: ${nombre || "(sin nombre)"}`,
      `Correo: ${correo}`,
      `Rubro: ${rubro || "(no indicado)"}`,
      `Fecha: ${fecha} ${horario}`,
      `Mensaje: ${mensaje || "(sin mensaje)"}`,
    ].join("<br>");
    await Promise.all(
      destinatarios.map((d) => enviarCorreoAlCliente(d, "Frondix (nueva reunion agendada)", cuerpo))
    );
  }

  return NextResponse.json({ ok: true });
}
