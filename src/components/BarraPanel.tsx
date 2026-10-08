"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { COOKIE_EMPRESA_ACTIVA } from "@/lib/sesion";

const enlaces = [
  { href: "/dashboard", texto: "Mis módulos" },
  { href: "/dashboard/upload", texto: "Subir Excel" },
  { href: "/dashboard/seguimiento", texto: "Seguimiento" },
  { href: "/dashboard/calendario", texto: "Calendario" },
  { href: "/dashboard/team", texto: "Equipo" },
];

// Compras y Ventas ya no son botones propios: se ven desde el desplegable de
// Reportes (junto con Balance, que es la foto combinada de ambos).
const reportesSubmenu = [
  { href: "/dashboard/reportes", texto: "Balance" },
  { href: "/dashboard/ventas", texto: "Venta" },
  { href: "/dashboard/compras", texto: "Compras" },
];

const itemsMenu = [
  { href: "/dashboard/cuenta", texto: "Mis datos" },
  { href: "/dashboard/empresa", texto: "Mi empresa" },
  { href: "/dashboard/billing", texto: "Plan y pagos" },
];

export default function BarraPanel() {
  const ruta = usePathname();
  const router = useRouter();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [reportesAbierto, setReportesAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const reportesRef = useRef<HTMLDivElement>(null);

  // Cierra los menús al tocar afuera.
  useEffect(() => {
    function alTocarFuera(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
      if (reportesRef.current && !reportesRef.current.contains(e.target as Node)) setReportesAbierto(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, []);

  // "Mis módulos" también queda marcada dentro de un módulo concreto (/dashboard/<id>).
  const fijas = [...enlaces.map((e) => e.href), ...reportesSubmenu.map((e) => e.href)];
  const activo = (href: string) =>
    href === "/dashboard" ? ruta === "/dashboard" || !fijas.some((f) => f !== "/dashboard" && ruta.startsWith(f)) : ruta === href;
  const activoReportes = reportesSubmenu.some((s) => s.href === ruta);

  async function salir() {
    await crearClienteBrowser().auth.signOut();
    // Si otra persona usa el mismo navegador después, que no herede la empresa
    // que tenías elegida (no es un problema de seguridad -- RLS igual la filtra
    // por usuario -- pero sí de confusión).
    document.cookie = `${COOKIE_EMPRESA_ACTIVA}=; path=/; max-age=0`;
    router.push("/");
    router.refresh();
  }

  return (
    <header className="barra-panel">
      <div className="contenedor barra-fila">
        <Logo href="/dashboard" />
        <nav className="nav-panel" aria-label="Panel">
          {enlaces.slice(0, 2).map((e) => (
            <Link key={e.href} href={e.href} className="nav-link" aria-current={activo(e.href) ? "page" : undefined}>
              {e.texto}
            </Link>
          ))}
          <div className="menu-cuenta" ref={reportesRef}>
            <button
              type="button"
              className="nav-link"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
              aria-haspopup="menu"
              aria-expanded={reportesAbierto}
              aria-current={activoReportes ? "page" : undefined}
              onClick={() => setReportesAbierto((v) => !v)}
            >
              Reportes
            </button>
            {reportesAbierto && (
              <div className="menu-cuenta-lista" role="menu">
                {reportesSubmenu.map((s) => (
                  <Link key={s.href} href={s.href} className="menu-cuenta-item" role="menuitem" onClick={() => setReportesAbierto(false)}>
                    {s.texto}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {enlaces.slice(2).map((e) => (
            <Link key={e.href} href={e.href} className="nav-link" aria-current={activo(e.href) ? "page" : undefined}>
              {e.texto}
            </Link>
          ))}
        </nav>
        <div className="menu-cuenta" ref={menuRef}>
          <button
            type="button"
            className="menu-cuenta-boton"
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
            onClick={() => setMenuAbierto((v) => !v)}
          >
            Mi cuenta
          </button>
          {menuAbierto && (
            <div className="menu-cuenta-lista" role="menu">
              {itemsMenu.map((item) => (
                <Link key={item.href} href={item.href} className="menu-cuenta-item" role="menuitem" onClick={() => setMenuAbierto(false)}>
                  {item.texto}
                </Link>
              ))}
              <button type="button" className="menu-cuenta-item" role="menuitem" onClick={salir}>
                Salir
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
