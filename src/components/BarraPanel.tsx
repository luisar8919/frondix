"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { COOKIE_EMPRESA_ACTIVA } from "@/lib/sesion";
import { esVendedor, rolRestringido } from "@/lib/permisos";

const enlaces = [
  { href: "/dashboard", texto: "Inicio" },
  { href: "/dashboard/upload", texto: "Subir Excel" },
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

const reglasSubmenu = [
  { href: "/dashboard/recetas", texto: "Automatizaciones" },
  { href: "/dashboard/reglas", texto: "Condicionales" },
  { href: "/dashboard/notificaciones", texto: "Notificaciones" },
  { href: "/dashboard/enlaces", texto: "Enlaces" },
  { href: "/dashboard/interfaces", texto: "Interfaces" },
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

// En celular, el .nav-panel horizontal (overflow-x:auto, ver globals.css) se
// queda recortando casi todos los links sin ninguna pista visual de que hay
// más para el costado -- encontrado al revisar la app a 375px de ancho.
// Este botón ☰ (solo visible en ese mismo breakpoint, ver .boton-menu-movil)
// agrupa TODO lo mismo que ya arma el nav de escritorio en una sola lista
// vertical, reusando el mismo patrón visual de .menu-cuenta-lista.
function MenuMovil({
  enlacesVisibles,
  modulosSubmenu,
  hayAlgo,
  interfaces,
  rolBloqueado,
  mostrarCalendario,
}: {
  enlacesVisibles: { href: string; texto: string }[];
  modulosSubmenu: { href: string; texto: string }[];
  hayAlgo: boolean;
  interfaces: { href: string; texto: string }[];
  // true para vendedor Y mozo: oculta Módulos/Resumen/Seguimiento/Configuración
  // (ver rolRestringido en permisos.ts) -- mismo criterio que ya usaba este
  // componente solo para vendedor.
  rolBloqueado: boolean;
  // Calendario, en cambio, es SOLO de vendedor (un mozo no agenda citas) --
  // por eso va aparte en vez de colgar del mismo booleano de arriba.
  mostrarCalendario: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alTocarFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, []);

  function Separador({ texto }: { texto: string }) {
    return <p className="suave pequeno" style={{ margin: "10px 10px 2px", fontWeight: 700 }}>{texto}</p>;
  }

  return (
    <div className="menu-movil" ref={ref}>
      <button
        type="button"
        className="menu-cuenta-boton boton-menu-movil"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Abrir menú"
        onClick={() => setAbierto((v) => !v)}
      >
        ☰ Menú
      </button>
      {abierto && (
        <div className="menu-cuenta-lista" role="menu" style={{ maxHeight: "75vh", overflowY: "auto", width: 230 }}>
          {enlacesVisibles.map((e) => (
            <Link key={e.href} href={e.href} className="menu-cuenta-item" role="menuitem" onClick={() => setAbierto(false)}>
              {e.texto}
            </Link>
          ))}
          {!rolBloqueado && hayAlgo && (
            <>
              <Separador texto="Módulos" />
              {modulosSubmenu.map((s) => (
                <Link key={s.href} href={s.href} className="menu-cuenta-item" role="menuitem" onClick={() => setAbierto(false)}>
                  {s.texto}
                </Link>
              ))}
            </>
          )}
          {interfaces.length > 0 && (
            <>
              <Separador texto="Interfaces" />
              {interfaces.map((s) => (
                <Link key={s.href} href={s.href} className="menu-cuenta-item" role="menuitem" onClick={() => setAbierto(false)}>
                  {s.texto}
                </Link>
              ))}
            </>
          )}
          {!rolBloqueado && (
            <>
              <Separador texto="Resumen" />
              {resumenSubmenu.map((s) => (
                <Link key={s.href} href={s.href} className="menu-cuenta-item" role="menuitem" onClick={() => setAbierto(false)}>
                  {s.texto}
                </Link>
              ))}
              <Separador texto="Seguimiento" />
              {seguimientoSubmenu.map((s) => (
                <Link key={s.href} href={s.href} className="menu-cuenta-item" role="menuitem" onClick={() => setAbierto(false)}>
                  {s.texto}
                </Link>
              ))}
              <Separador texto="Configuración" />
              {reglasSubmenu.map((s) => (
                <Link key={s.href} href={s.href} className="menu-cuenta-item" role="menuitem" onClick={() => setAbierto(false)}>
                  {s.texto}
                </Link>
              ))}
            </>
          )}
          {mostrarCalendario && (
            <Link href="/dashboard/calendario" className="menu-cuenta-item" role="menuitem" onClick={() => setAbierto(false)}>
              Calendario
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export default function BarraPanel({
  rol,
  modulos,
  extras,
  interfaces,
}: {
  rol?: string;
  // Los módulos reales de la empresa (mismos que la tarjeta de Inicio, ver
  // dashboard/layout.tsx) -- el desplegable "Módulos" lista exactamente esto,
  // sin agrupar por tipo. Sin ninguno, el botón se bloquea en vez de abrir un
  // desplegable vacío.
  modulos: { id: string; nombre: string }[];
  // Clientes/Proveedores/Cotizaciones/Órdenes de compra: no tienen tarjeta en
  // Inicio, pero el layout ya los filtró para mandar solo los que tienen al
  // menos un dato real (ver dashboard/layout.tsx).
  extras: { href: string; texto: string }[];
  // Punto de Venta / Atención: ya vienen filtradas por el layout (aplican
  // estructuralmente Y no están apagadas a mano en Configuración >
  // Interfaces, ver lib/interfaces.ts) -- acá no se vuelve a decidir nada,
  // solo se muestra. Sin ninguna, el botón directamente no aparece.
  interfaces: { key: string; label: string; href: string }[];
}) {
  const rolBloqueado = rolRestringido(rol);
  const mostrarCalendario = esVendedor(rol); // mozo no agenda citas, ver comentario en MenuMovil
  const modulosSubmenu = [
    ...modulos.map((m) => ({ href: `/dashboard/${m.id}`, texto: m.nombre })),
    ...extras,
    { href: "/dashboard/modulos/nuevo", texto: "+ Agregar módulo" },
  ];
  const hayAlgo = modulos.length > 0 || extras.length > 0;
  const interfacesSubmenu = interfaces.map((i) => ({ href: i.href, texto: i.label }));
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
  const fijas = [...enlaces.map((e) => e.href), ...modulosSubmenu.map((e) => e.href), ...resumenSubmenu.map((e) => e.href), ...seguimientoSubmenu.map((e) => e.href), ...reglasSubmenu.map((e) => e.href), ...interfacesSubmenu.map((e) => e.href)];
  const activo = (href: string) =>
    href === "/dashboard" ? ruta === "/dashboard" || !fijas.some((f) => f !== "/dashboard" && ruta.startsWith(f)) : ruta === href;
  const activoModulos = modulosSubmenu.some((s) => s.href === ruta) || /^\/dashboard\/[0-9a-f-]{36}$/.test(ruta);
  const activoResumen = resumenSubmenu.some((s) => s.href === ruta);
  const activoSeguimiento = seguimientoSubmenu.some((s) => s.href === ruta);
  const activoReglas = reglasSubmenu.some((s) => s.href === ruta);
  const activoInterfaces = interfacesSubmenu.some((s) => s.href === ruta);

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
          {enlaces.filter((e) => !rolBloqueado || e.href !== "/dashboard/upload").map((e) => (
            <Link key={e.href} href={e.href} className="nav-link" aria-current={activo(e.href) ? "page" : undefined}>
              {e.texto}
            </Link>
          ))}
          {interfacesSubmenu.length > 0 && (
            <BotonSubmenu texto="Interfaces" items={interfacesSubmenu} activo={activoInterfaces} />
          )}
          {!rolBloqueado && hayAlgo && (
            <BotonSubmenu texto="Módulos" items={modulosSubmenu} activo={activoModulos} />
          )}
          {!rolBloqueado && !hayAlgo && (
            <span className="nav-link" aria-disabled="true" title="Sube tu primer Excel para ver tus módulos aquí" style={{ opacity: 0.4, cursor: "not-allowed" }}>
              Módulos
            </span>
          )}
          {!rolBloqueado && <BotonSubmenu texto="Resumen" items={resumenSubmenu} activo={activoResumen} />}
          {!rolBloqueado && <BotonSubmenu texto="Seguimiento" items={seguimientoSubmenu} activo={activoSeguimiento} />}
          {!rolBloqueado && <BotonSubmenu texto="Configuración" items={reglasSubmenu} activo={activoReglas} />}
          {mostrarCalendario && (
            <Link href="/dashboard/calendario" className="nav-link" aria-current={activo("/dashboard/calendario") ? "page" : undefined}>
              Calendario
            </Link>
          )}
        </nav>
        <MenuMovil
          enlacesVisibles={enlaces.filter((e) => !rolBloqueado || e.href !== "/dashboard/upload")}
          modulosSubmenu={modulosSubmenu}
          hayAlgo={hayAlgo}
          interfaces={interfacesSubmenu}
          rolBloqueado={rolBloqueado}
          mostrarCalendario={mostrarCalendario}
        />
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
              {itemsMenu.filter((item) => !rolBloqueado || item.href !== "/dashboard/team").map((item) => (
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
