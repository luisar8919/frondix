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
];

// Cada entrada de negocio (Ventas, Compras, Stock, Proveedor, Cliente) con sus
// dos puertas: Registrar (cargar algo nuevo) y Reporte (ver lo acumulado).
// "Registrar" de Ventas/Compras es un redirect inteligente (ver
// dashboard/ventas/registrar) a tu único módulo de ese tipo si tienes uno
// solo; con 0 o varios cae al Reporte, que ya deja elegir/expandir cada uno.
const modulosSubmenu = [
  { href: "/dashboard/ventas/registrar", texto: "Ventas · Registrar" },
  { href: "/dashboard/ventas", texto: "Ventas · Reporte" },
  { href: "/dashboard/compras/registrar", texto: "Compras · Registrar" },
  { href: "/dashboard/compras", texto: "Compras · Reporte" },
  { href: "/dashboard/ordenes-compra", texto: "Compras · Órdenes de compra" },
  { href: "/dashboard/inventario", texto: "Stock · Reporte" },
  { href: "/dashboard/proveedores/nuevo", texto: "Proveedor · Registrar" },
  { href: "/dashboard/proveedores", texto: "Proveedor · Reporte" },
  { href: "/dashboard/pipeline", texto: "Cliente · Registrar" },
  { href: "/dashboard/clientes", texto: "Cliente · Reporte" },
];

const resumenSubmenu = [
  { href: "/dashboard/reportes/resumen", texto: "General" },
  { href: "/dashboard/logros", texto: "Hitos" },
  { href: "/dashboard/reportes", texto: "Balance" },
];

const seguimientoSubmenu = [
  { href: "/dashboard/clientes", texto: "Historial" },
  { href: "/dashboard/pipeline", texto: "Pipeline" },
  { href: "/dashboard/seguimiento", texto: "Seguimiento" },
  { href: "/dashboard/alertas", texto: "Alertas" },
  { href: "/dashboard/calendario", texto: "Calendario" },
];

const itemsMenu = [
  { href: "/dashboard/cuenta", texto: "Mis datos" },
  { href: "/dashboard/empresa", texto: "Mi empresa" },
  { href: "/dashboard/team", texto: "Equipo" },
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
  const fijas = [...enlaces.map((e) => e.href), ...modulosSubmenu.map((e) => e.href), ...resumenSubmenu.map((e) => e.href), ...seguimientoSubmenu.map((e) => e.href)];
  const activo = (href: string) =>
    href === "/dashboard" ? ruta === "/dashboard" || !fijas.some((f) => f !== "/dashboard" && ruta.startsWith(f)) : ruta === href;
  const activoModulos = modulosSubmenu.some((s) => s.href === ruta) || /^\/dashboard\/[0-9a-f-]{36}$/.test(ruta);
  const activoResumen = resumenSubmenu.some((s) => s.href === ruta);
  const activoSeguimiento = seguimientoSubmenu.some((s) => s.href === ruta);

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
          {enlaces.filter((e) => !esVendedor || e.href !== "/dashboard/upload").map((e) => (
            <Link key={e.href} href={e.href} className="nav-link" aria-current={activo(e.href) ? "page" : undefined}>
              {e.texto}
            </Link>
          ))}
          {!esVendedor && <BotonSubmenu texto="Módulos" items={modulosSubmenu} activo={activoModulos} />}
          {!esVendedor && <BotonSubmenu texto="Resumen" items={resumenSubmenu} activo={activoResumen} />}
          {!esVendedor && <BotonSubmenu texto="Seguimiento" items={seguimientoSubmenu} activo={activoSeguimiento} />}
          {esVendedor && (
            <Link href="/dashboard/calendario" className="nav-link" aria-current={activo("/dashboard/calendario") ? "page" : undefined}>
              Calendario
            </Link>
          )}
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
              {itemsMenu.filter((item) => !esVendedor || item.href !== "/dashboard/team").map((item) => (
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
