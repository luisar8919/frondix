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
  { href: "/dashboard/compras", texto: "Compras" },
  { href: "/dashboard/ventas", texto: "Ventas" },
  { href: "/dashboard/seguimiento", texto: "Seguimiento" },
  { href: "/dashboard/reportes", texto: "Reportes generales" },
  { href: "/dashboard/calendario", texto: "Calendario" },
  { href: "/dashboard/team", texto: "Equipo" },
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
  const menuRef = useRef<HTMLDivElement>(null);

  // Cierra el menú al tocar afuera.
  useEffect(() => {
    function alTocarFuera(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, []);

  // "Mis módulos" también queda marcada dentro de un módulo concreto (/dashboard/<id>).
  const fijas = enlaces.map((e) => e.href);
  const activo = (href: string) =>
    href === "/dashboard" ? ruta === "/dashboard" || !fijas.some((f) => f !== "/dashboard" && ruta.startsWith(f)) : ruta === href;

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
          {enlaces.map((e) => (
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
