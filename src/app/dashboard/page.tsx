import Link from "next/link";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  // El middleware no corre en Azure Static Web Apps: la página misma exige la sesión.
  if (!user) redirect("/login");

  const { data: miembro } = await supabase
    .from("miembros")
    .select("empresa_id, empresas(nombre)")
    .eq("user_id", user.id)
    .single();

  const { data: datasets } = await supabase
    .from("datasets")
    .select("id, nombre, created_at")
    .eq("empresa_id", miembro?.empresa_id)
    .order("created_at", { ascending: false });

  const empresa = (miembro?.empresas as any)?.nombre ?? "tu negocio";
  const hayTablas = !!datasets && datasets.length > 0;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>{empresa}</h1>
          <p className="suave">
            {hayTablas ? `${datasets!.length} ${datasets!.length === 1 ? "tabla" : "tablas"} en tu panel` : "Empecemos por tu primer Excel"}
          </p>
        </div>
        <div className="acciones">
          <Link href="/dashboard/upload/auto" className="btn btn-secundario">Generar tablas</Link>
          <Link href="/dashboard/upload" className="btn btn-primario">Subir Excel</Link>
        </div>
      </div>

      {!hayTablas && (
        <div className="tarjeta tarjeta-elevada vacio">
          <h2 style={{ fontSize: 24 }}>Todavía no hay tablas</h2>
          <p style={{ maxWidth: 46 + "ch", margin: "0 auto 20px" }}>
            Subí el Excel que ya usás y en un minuto tenés una tabla con formulario de carga y buscador.
          </p>
          <Link href="/dashboard/upload" className="btn btn-primario btn-grande">Subir mi primer Excel</Link>
        </div>
      )}

      {hayTablas && (
        <div className="grilla-tablas">
          {datasets!.map((d) => (
            <Link key={d.id} href={`/dashboard/${d.id}`} className="tarjeta tarjeta-tabla">
              <div className="icono" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#237a50" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
                  <path d="M2.5 8.5h15M8 8.5v8" />
                </svg>
              </div>
              <h3>{d.nombre}</h3>
              <p className="suave pequeno" style={{ margin: 0 }}>
                Creada el {new Date(d.created_at).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
