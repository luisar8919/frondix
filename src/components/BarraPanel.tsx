"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { COOKIE_EMPRESA_ACTIVA } from "@/lib/sesion";

const enlaces = [
  { href: "/dashboard", texto: "Inicio" },
  { href: "/dashboard/upload", texto: "Subir Excel" },
  { href: "/dashboard/inventario", texto: "Inventario" },
  { href: "/dashboard/calendario", texto: "Calendario" },
  { href: "/dashboard/team", texto: "Equipo" },
];

// Compras y Ventas ya no son botones propios: se ven desde el desplegable de
// Reportes (junto con Balance, la foto combinada de ambos, Resumen -- los
// highlights con IA + el detalle por módulo -- y Órdenes de compra).
const reportesSubmenu = [
  { href: "/dashboard/reportes", texto: "Balance" },
  { href: "/dashboard/reportes/resumen", texto: "Resumen" },
  { href: "/dashboard/ventas", texto: "Venta" },
  { href: "/dashboard/compras", texto: "Compras" },
  { href: "/dashboard/ordenes-compra", texto: "Órdenes de compra" },
];

// Pipeline y Seguimiento dejaron de ser botones propios: ahora viven dentro
// del desplegable de Clientes, junto al historial (antes era el único
// contenido del botón "Clientes").
const clientesSubmenu = [
  { href: "/dashboard/clientes", texto: "Historial" },
  { href: "/dashboard/pipeline", texto: "Pipeline" },
  { href: "/dashboard/seguimiento", texto: "Seguimiento" },
];

const itemsMenu = [
  { href: "/dashboard/cuenta", texto: "Mis datos" },
  { href: "/dashboard/empresa", texto: "Mi empresa" },
  { href: "/dashboard/actividad", texto: "Actividad" },
  { href: "/dashboard/billing", texto: "Plan y pagos" },
];

// Botón con desplegable (Reportes, Clientes): la lista se dibuja fuera de
// nav-panel y con position:fixed medida desde el botón -- así escapa el
// overflow-x:auto de nav-panel (que por CSS recortaría también el eje Y,
// ver nav-panel en globals.css) sin sacar el botón de su sitio en el flujo.
function BotonSubmenu({
  texto,
  items,
  activo,
}: {
  texto: string;
  items: { href: string; texto: string }[];
  activo: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alTocarFuera(e: MouseEvent) {
      if (botonRef.current?.contains(e.target as Node) || listaRef.current?.contains(e.target as Node)) return;
      setAbierto(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, []);

  function alClick() {
    const r = botonRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, left: r.left });
    setAbierto((v) => !v);
  }

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className="nav-link"
        style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-current={activo ? "page" : undefined}
        onClick={alClick}
      >
        {texto}
      </button>
      {abierto && (
        <div ref={listaRef} className="menu-cuenta-lista" role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, right: "auto" }}>
          {items.map((s) => (
            <Link key={s.href} href={s.href} className="menu-cuenta-item" role="menuitem" onClick={() => setAbierto(false)}>
              {s.texto}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function BarraPanel({ rol }: { rol?: string }) {
  const esVendedor = rol === "vendedor";
  const ruta = usePathname();
  const router = useRouter();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cierra el menú de cuenta al tocar afuera.
  useEffect(() => {
    function alTocarFuera(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, []);

  // "Inicio" también queda marcada dentro de un módulo concreto (/dashboard/<id>).
  const fijas = [...enlaces.map((e) => e.href), ...reportesSubmenu.map((e) => e.href), ...clientesSubmenu.map((e) => e.href)];
  const activo = (href: string) =>
    href === "/dashboard" ? ruta === "/dashboard" || !fijas.some((f) => f !== "/dashboard" && ruta.startsWith(f)) : ruta === href;
  const activoReportes = reportesSubmenu.some((s) => s.href === ruta);
  const activoClientes = clientesSubmenu.some((s) => s.href === ruta);

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
          {enlaces.slice(0, 2).filter((e) => !esVendedor || e.href !== "/dashboard/upload").map((e) => (
            <Link key={e.href} href={e.href} className="nav-link" aria-current={activo(e.href) ? "page" : undefined}>
              {e.texto}
            </Link>
          ))}
          {!esVendedor && <BotonSubmenu texto="Reportes" items={reportesSubmenu} activo={activoReportes} />}
          {enlaces.slice(2, 3).filter(() => !esVendedor).map((e) => (
            <Link key={e.href} href={e.href} className="nav-link" aria-current={activo(e.href) ? "page" : undefined}>
              {e.texto}
            </Link>
          ))}
          {!esVendedor && <BotonSubmenu texto="Clientes" items={clientesSubmenu} activo={activoClientes} />}
          {enlaces.slice(3).filter((e) => !esVendedor || e.href !== "/dashboard/team").map((e) => (
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
