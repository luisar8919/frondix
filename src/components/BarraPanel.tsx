"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { crearClienteBrowser } from "@/lib/supabase/client";

const enlaces = [
  { href: "/dashboard", texto: "Mis tablas" },
  { href: "/dashboard/upload", texto: "Subir Excel" },
  { href: "/dashboard/upload/auto", texto: "Generar tablas" },
  { href: "/dashboard/seguimiento", texto: "Seguimiento" },
  { href: "/dashboard/team", texto: "Equipo" },
  { href: "/dashboard/billing", texto: "Plan y pagos" },
];

export default function BarraPanel() {
  const ruta = usePathname();
  const router = useRouter();

  // "Mis tablas" también queda marcada dentro de una tabla concreta (/dashboard/<id>).
  const fijas = enlaces.map((e) => e.href);
  const activo = (href: string) =>
    href === "/dashboard" ? ruta === "/dashboard" || !fijas.some((f) => f !== "/dashboard" && ruta.startsWith(f)) : ruta === href;

  async function salir() {
    await crearClienteBrowser().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="barra-panel">
      <div className="contenedor barra-fila">
        <Logo href="/dashboard" />
        <nav className="nav-panel" aria-label="Panel">
          {enlaces.map((e) => (
            <Link key={e.href} href={e.href} className="nav-link" aria-current={activo(e.href) ? "page" : undefined}>
              {e.texto}
            </Link>
          ))}
        </nav>
        <button type="button" className="btn btn-fantasma" onClick={salir}>Salir</button>
      </div>
    </header>
  );
}
