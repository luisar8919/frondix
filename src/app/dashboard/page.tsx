import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: miembro } = await supabase
    .from("miembros")
    .select("empresa_id, empresas(nombre)")
    .eq("user_id", user!.id)
    .single();

  const { data: datasets } = await supabase
    .from("datasets")
    .select("id, nombre, created_at")
    .eq("empresa_id", miembro?.empresa_id)
    .order("created_at", { ascending: false });

  return (
    <main style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1>{(miembro?.empresas as any)?.nombre ?? "Tu CRM"}</h1>
      <nav style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <Link href="/dashboard/upload">+ Subir Excel</Link>
        <Link href="/dashboard/upload/auto">+ Generar tablas automáticamente</Link>
        <Link href="/dashboard/team">Equipo</Link>
        <Link href="/dashboard/billing">Facturación</Link>
      </nav>

      <h2>Tus tablas</h2>
      {(!datasets || datasets.length === 0) && <p>Todavía no subiste ningún Excel.</p>}
      <ul>
        {datasets?.map((d) => (
          <li key={d.id}>
            <Link href={`/dashboard/${d.id}`}>{d.nombre}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
