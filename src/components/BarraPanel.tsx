"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario, elegirEmpresaActiva, type EmpresaDeUsuario } from "@/lib/sesion";

const enlaces = [
  { href: "/dashboard", texto: "Mis módulos" },
  { href: "/dashboard/upload", texto: "Subir Excel" },
  { href: "/dashboard/seguimiento", texto: "Seguimiento" },
  { href: "/dashboard/reportes", texto: "Reportes" },
  { href: "/dashboard/team", texto: "Equipo" },
  { href: "/dashboard/cuenta", texto: "Mi cuenta" },
  { href: "/dashboard/billing", texto: "Plan y pagos" },
];

export default function BarraPanel() {
  const ruta = usePathname();
  const router = useRouter();
  const [empresas, setEmpresas] = useState<EmpresaDeUsuario[] | null>(null);
  const [empresaActual, setEmpresaActual] = useState<string | null>(null);

  // Casi siempre es 1 sola empresa (no se muestra nada); el selector solo
  // aparece para quien gestiona más de un negocio (invitado a otro, además del suyo).
  useEffect(() => {
    (async () => {
      const sesion = await empresaDelUsuario(crearClienteBrowser());
      if (sesion.ok && sesion.empresas.length > 1) {
        setEmpresas(sesion.empresas);
        setEmpresaActual(sesion.empresaId);
      }
    })();
  }, []);

  // "Mis módulos" también queda marcada dentro de un módulo concreto (/dashboard/<id>).
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
        {empresas && empresaActual && (
          <select
            aria-label="Empresa que estás gestionando"
            value={empresaActual}
            onChange={(e) => elegirEmpresaActiva(e.target.value)}
            style={{ marginRight: 10 }}
          >
            {empresas.map((e) => (
              <option key={e.empresaId} value={e.empresaId}>{e.nombre}</option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn-fantasma" onClick={salir}>Salir</button>
      </div>
    </header>
  );
}
