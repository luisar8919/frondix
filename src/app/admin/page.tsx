import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import Logo from "@/components/Logo";
import { CATEGORIAS_MODULOS, PLANTILLAS_EXTRA } from "@/lib/plantillasModulo";

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
    .select("id, nombre, created_at, miembros(user_id, rol), datasets(id, plantilla), suscripciones(estado, prueba_hasta), contactos(id)")
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

  // --- Resumen tipo "Product Owner": en qué va el negocio, no empresa por
  // empresa. Nada de esto pasa por una librería de gráficos ni una tabla
  // nueva -- son conteos simples sobre los mismos datos de arriba, para que
  // decidir "qué construir después" se apoye en qué usa la gente de verdad
  // en vez de en la última conversación. 4 preguntas:
  const ahora = Date.now();
  let pagando = 0, enPrueba = 0, pruebaVencida = 0, nuncaProbaron = 0;
  for (const e of empresas ?? []) {
    const s = (e.suscripciones ?? [])[0];
    const activa = s?.estado === "activa";
    const vencePrueba = s?.prueba_hasta ? new Date(s.prueba_hasta).getTime() : null;
    if (activa && !s?.prueba_hasta) pagando++;
    else if (activa && vencePrueba && vencePrueba > ahora) enPrueba++;
    else if (s?.prueba_hasta) pruebaVencida++;
    else nuncaProbaron++;
  }

  // 2) ¿Para qué tipo de negocio arma más módulos la gente? Un rubro cuenta
  // una sola vez por empresa (si una empresa tiene 3 módulos de "finanzas",
  // no infla el conteo), para ver cuántos NEGOCIOS distintos lo usan, no
  // cuántas tablas. Sirve para decidir en qué rubro vale la pena invertir
  // más plantillas, igual que un "Segment Owner" prioriza por segmento.
  const categoriaPorPlantilla = new Map<string, string>(PLANTILLAS_EXTRA.map((p) => [p.clave, p.categoria]));
  const tituloCategoria = new Map<string, string>(CATEGORIAS_MODULOS.map((c) => [c.clave, c.titulo]));
  const empresasPorCategoria = new Map<string, number>();
  const usosPorPlantilla = new Map<string, number>();
  for (const e of empresas ?? []) {
    const categoriasDeEstaEmpresa = new Set<string>();
    for (const d of e.datasets ?? []) {
      if (!d.plantilla) continue; // Ventas/Compras/Excel/IA: gratis, no son "elección de rubro"
      usosPorPlantilla.set(d.plantilla, (usosPorPlantilla.get(d.plantilla) ?? 0) + 1);
      const cat = categoriaPorPlantilla.get(d.plantilla);
      if (cat) categoriasDeEstaEmpresa.add(cat);
    }
    for (const cat of categoriasDeEstaEmpresa) empresasPorCategoria.set(cat, (empresasPorCategoria.get(cat) ?? 0) + 1);
  }
  const topCategorias = [...empresasPorCategoria.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const nombrePlantilla = new Map<string, string>(PLANTILLAS_EXTRA.map((p) => [p.clave, p.nombre]));
  const topPlantillas = [...usosPorPlantilla.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="contenedor" style={{ padding: "32px 16px" }}>
      <Logo href="/dashboard" />
      <h1 style={{ marginTop: 20 }}>Panel interno</h1>
      <p className="suave">Visibilidad de uso real por empresa. Solo tú ves esto.</p>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Conversión</h2>
      <p className="suave pequeno" style={{ marginTop: -6, marginBottom: 14 }}>
        De las {empresas?.length ?? 0} empresas registradas, cuántas están en cada etapa.
      </p>
      <div className="grilla-tablas" style={{ gap: 12 }}>
        <div className="tarjeta">
          <p className="suave pequeno" style={{ margin: 0 }}>Pagando</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0" }}>{pagando}</p>
        </div>
        <div className="tarjeta">
          <p className="suave pequeno" style={{ margin: 0 }}>En prueba gratis</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0" }}>{enPrueba}</p>
        </div>
        <div className="tarjeta">
          <p className="suave pequeno" style={{ margin: 0 }}>Probaron y no pagaron</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0" }}>{pruebaVencida}</p>
        </div>
        <div className="tarjeta">
          <p className="suave pequeno" style={{ margin: 0 }}>Nunca activaron la prueba</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0" }}>{nuncaProbaron}</p>
        </div>
      </div>

      <h2 style={{ fontSize: 18, marginTop: 28 }}>Qué construye la gente</h2>
      <p className="suave pequeno" style={{ marginTop: -6, marginBottom: 14 }}>
        Para decidir en qué rubro y qué módulo conviene invertir más, antes de que lo pidan.
      </p>
      <div className="grilla-tablas" style={{ gap: 20 }}>
        <div className="tarjeta">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Rubros con más empresas</h3>
          {topCategorias.length === 0 && <p className="suave pequeno">Nadie usó un módulo del catálogo todavía.</p>}
          {topCategorias.map(([clave, cantidad]) => (
            <div key={clave} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span className="pequeno">{tituloCategoria.get(clave) ?? clave}</span>
              <span className="pequeno" style={{ fontWeight: 700 }}>{cantidad}</span>
            </div>
          ))}
        </div>
        <div className="tarjeta">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Plantillas más creadas</h3>
          {topPlantillas.length === 0 && <p className="suave pequeno">Nadie usó un módulo del catálogo todavía.</p>}
          {topPlantillas.map(([clave, cantidad]) => (
            <div key={clave} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span className="pequeno">{nombrePlantilla.get(clave) ?? clave}</span>
              <span className="pequeno" style={{ fontWeight: 700 }}>{cantidad}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 14 }}>Por empresa</h2>
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
