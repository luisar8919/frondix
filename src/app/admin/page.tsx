import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import Logo from "@/components/Logo";

// Panel interno (no para clientes): cuándo entró cada empresa por última vez y
// qué tanto usa la plataforma. Cruza datos de TODAS las empresas, así que nunca
// se pasa por RLS -- solo lo puede abrir el dueño de Frondix (este email).
const EMAIL_ADMIN = "luisar8919@gmail.com";

interface FilaPanel {
  empresaId: string;
  nombre: string;
  emailDueno: string;
  ultimoIngreso: string | null;
  registradoEl: string;
  miembros: number;
  modulos: number;
  registros: number;
  ultimoRegistroEl: string | null;
  usaSeguimiento: boolean;
  plan: string;
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "nunca";

export default async function PanelInternoPage() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== EMAIL_ADMIN) redirect("/login");

  const admin = crearClienteAdmin();

  const { data: empresas } = await admin
    .from("empresas")
    .select("id, nombre, created_at, miembros(user_id, rol), datasets(id), suscripciones(estado), contactos(id)")
    .order("created_at", { ascending: false });

  const { data: usuarios } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const porId = new Map(usuarios.users.map((u) => [u.id, u]));

  const filas: FilaPanel[] = [];
  for (const e of empresas ?? []) {
    const dueno = (e.miembros ?? []).find((m) => m.rol === "dueno");
    const usuarioDueno = dueno ? porId.get(dueno.user_id) : undefined;

    const datasetIds = (e.datasets ?? []).map((d) => d.id);
    let registros = 0;
    let ultimoRegistroEl: string | null = null;
    if (datasetIds.length > 0) {
      const { data: recs, count } = await admin
        .from("records")
        .select("created_at", { count: "exact" })
        .in("dataset_id", datasetIds)
        .order("created_at", { ascending: false })
        .limit(1);
      registros = count ?? 0;
      ultimoRegistroEl = recs?.[0]?.created_at ?? null;
    }

    filas.push({
      empresaId: e.id,
      nombre: e.nombre,
      emailDueno: usuarioDueno?.email ?? "(sin dueño)",
      ultimoIngreso: usuarioDueno?.last_sign_in_at ?? null,
      registradoEl: e.created_at,
      miembros: (e.miembros ?? []).length,
      modulos: datasetIds.length,
      registros,
      ultimoRegistroEl,
      usaSeguimiento: (e.contactos ?? []).length > 0,
      plan: (e.suscripciones ?? [])[0]?.estado ?? "sin_suscripcion",
    });
  }

  // Más reciente actividad primero: el último ingreso si hay, si no la fecha de registro.
  filas.sort((a, b) => new Date(b.ultimoIngreso ?? b.registradoEl).getTime() - new Date(a.ultimoIngreso ?? a.registradoEl).getTime());

  return (
    <div className="contenedor" style={{ padding: "32px 16px" }}>
      <Logo href="/dashboard" />
      <h1 style={{ marginTop: 20 }}>Panel interno</h1>
      <p className="suave">Visibilidad de uso real por empresa. Solo tú ves esto.</p>

      <div className="tabla-envoltura" style={{ marginTop: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Dueño</th>
              <th>Último ingreso</th>
              <th>Registrado el</th>
              <th className="num">Miembros</th>
              <th className="num">Módulos</th>
              <th className="num">Registros</th>
              <th>Último dato cargado</th>
              <th>Seguimiento</th>
              <th>Plan</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.empresaId}>
                <td>{f.nombre}</td>
                <td>{f.emailDueno}</td>
                <td>{fecha(f.ultimoIngreso)}</td>
                <td>{fecha(f.registradoEl)}</td>
                <td className="num">{f.miembros}</td>
                <td className="num">{f.modulos}</td>
                <td className="num">{f.registros}</td>
                <td>{fecha(f.ultimoRegistroEl)}</td>
                <td>{f.usaSeguimiento ? "Sí" : "No"}</td>
                <td>{f.plan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length === 0 && <p className="suave" style={{ marginTop: 20 }}>Todavía no hay empresas registradas.</p>}
    </div>
  );
}
