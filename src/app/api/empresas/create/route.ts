import { NextRequest, NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

// Se llama una sola vez, justo después del signup: crea la empresa
// y hace al usuario "dueno". Usa la service role porque en ese momento
// el usuario todavía no es miembro de ninguna empresa (RLS lo bloquearía).
export async function POST(req: NextRequest) {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { nombreEmpresa } = await req.json();
  if (!nombreEmpresa || typeof nombreEmpresa !== "string") {
    return NextResponse.json({ error: "Falta nombreEmpresa" }, { status: 400 });
  }

  const admin = crearClienteAdmin();

  const { data: empresa, error: errorEmpresa } = await admin
    .from("empresas")
    .insert({ nombre: nombreEmpresa })
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

  return NextResponse.json({ empresa });
}
