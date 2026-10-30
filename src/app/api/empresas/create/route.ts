import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { limitesDelUsuario } from "@/lib/limites";

// Primera empresa: se llama justo después del signup. También sirve para crear
// una empresa ADICIONAL (ver /dashboard/empresa), sujeto al tope de empresas
// propias por usuario (ver limites.ts). Usa la service role porque, en el caso
// del signup, el usuario todavía no es miembro de ninguna empresa (RLS lo bloquearía).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { nombreEmpresa, telefono } = await req.json();
  if (!nombreEmpresa || typeof nombreEmpresa !== "string") {
    return NextResponse.json({ error: "Falta nombreEmpresa" }, { status: 400 });
  }
  if (!telefono || typeof telefono !== "string" || !/^\d{9}$/.test(telefono)) {
    return NextResponse.json({ error: "El teléfono debe tener 9 dígitos (sin +51)" }, { status: 400 });
  }

  const limites = await limitesDelUsuario(supabase, user.id);
  if (limites.propias >= limites.maxPropias) {
    return NextResponse.json(
      {
        error: `Ya tienes ${limites.propias} de ${limites.maxPropias} empresas propias que permite tu plan.${
          limites.pagado ? "" : " Activa el plan pago en alguna de tus empresas para crear hasta 5."
        }`,
      },
      { status: 422 }
    );
  }

  const admin = crearClienteAdmin();

  const { data: empresa, error: errorEmpresa } = await admin
    .from("empresas")
    .insert({ nombre: nombreEmpresa, telefono })
    .select()
    .single();
  if (errorEmpresa || !empresa) {
    return NextResponse.json({ error: errorEmpresa?.message ?? "No se pudo crear la empresa" }, { status: 500 });
  }

  const { error: errorMiembro } = await admin
    .from("miembros")
    .insert({ empresa_id: empresa.id, user_id: user.id, rol: "dueno" });
  if (errorMiembro) {
    return NextResponse.json({ error: errorMiembro.message }, { status: 500 });
  }

  // Arranca en plan gratis (estado "pendiente" por default, sin prueba_hasta):
  // la prueba de 1 mes ya no se otorga sola, el usuario la activa cuando
  // quiere usar un módulo adicional (ver /api/billing/activar-prueba). Si este
  // insert falla no se revierte la empresa -- igual queda en plan gratis, que
  // ya es el estado por defecto, no bloquea el signup.
  await admin.from("suscripciones").insert({ empresa_id: empresa.id });

  return NextResponse.json({ empresa });
}
