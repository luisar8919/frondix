"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import { tieneSuscripcionActiva } from "@/lib/suscripcion";
import { tipoModulo } from "@/lib/roles";
import { esStock } from "@/lib/stock";
import { CATEGORIAS_MODULOS, PLANTILLAS_EXTRA, plantillaVentas, plantillaCompras, plantillaStock } from "@/lib/plantillasModulo";
import type { Columna } from "@/lib/excel-parser";

// Rubros donde Stock tiene sentido como recomendación de entrada -- el resto
// (servicios, finanzas, consignación, cobro recurrente, proyectos) no vende
// unidades físicas que llevar en inventario.
const CATEGORIAS_CON_STOCK = new Set(["stock_local", "produccion"]);

// Catálogo de módulos listos para usar más allá de Ventas/Compras (ver
// PLANTILLAS_EXTRA en lib/plantillasModulo.ts). Primero se elige el tipo de
// negocio (CATEGORIAS_MODULOS) para no tener que leer las 17 descripciones de
// una -- mismo patrón que ya usa el menú de Módulos (Ventas/Compras/Stock/
// Proveedor/Cliente). Un click elige la plantilla, confirma el nombre y crea
// el módulo ya con sus campos, mismo endpoint que ya usa "Empezar sin Excel"
// (/api/datasets/crear). Si llega con ?categoria=<clave> (desde el onboarding
// en /auth/completar, que ya preguntó el rubro) arranca directo en esa
// categoría, sin repetir la pregunta.
export default function NuevoModuloPage() {
  return (
    <Suspense fallback={null}>
      <NuevoModuloForm />
    </Suspense>
  );
}

function NuevoModuloForm() {
  const router = useRouter();
  const categoriaInicial = useSearchParams().get("categoria");
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS_MODULOS)[number] | null>(
    () => CATEGORIAS_MODULOS.find((c) => c.clave === categoriaInicial) ?? null
  );
  const [elegida, setElegida] = useState<(typeof PLANTILLAS_EXTRA)[number] | null>(null);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planActivo, setPlanActivo] = useState<boolean | null>(null);
  const [activandoPrueba, setActivandoPrueba] = useState(false);

  // Modo lote: solo al llegar recién del onboarding (?categoria= en la URL) --
  // navegar acá después a mano (desde "+ Agregar módulo") sigue siendo elegir
  // de a uno, para no forzar el lote en alguien que ya tiene su negocio armado.
  const [modoLote, setModoLote] = useState(!!categoriaInicial);
  const [existentes, setExistentes] = useState<{ ventas: boolean; compras: boolean; stock: boolean } | null>(null);
  const [seleccionLote, setSeleccionLote] = useState<Record<string, boolean>>({});
  const [creandoLote, setCreandoLote] = useState(false);

  useEffect(() => {
    const supabase = crearClienteBrowser();
    (async () => {
      const r = await empresaDelUsuario(supabase);
      if (!r.ok) return;
      setEmpresaId(r.empresaId);
      setPlanActivo(await tieneSuscripcionActiva(supabase, r.empresaId));

      if (categoriaInicial) {
        // Para no duplicar Ventas/Compras/Stock si el Excel (o una sesión
        // anterior) ya los creó -- el lote recomendado solo ofrece lo que falta.
        const { data: datasetsCrudos } = await supabase.from("datasets").select("nombre, columnas").eq("empresa_id", r.empresaId);
        const datasets = (datasetsCrudos ?? []).map((d) => ({ nombre: d.nombre, columnas: d.columnas as Columna[] }));
        const tipos = datasets.map((d) => tipoModulo(d.columnas.map((c) => c.rol), d.nombre));
        const ex = {
          ventas: tipos.includes("ventas"),
          compras: tipos.includes("compras"),
          stock: datasets.some((d) => esStock(d.columnas)),
        };
        setExistentes(ex);
        const cat = CATEGORIAS_MODULOS.find((c) => c.clave === categoriaInicial);
        const inicial: Record<string, boolean> = {
          ventas: !ex.ventas,
          compras: !ex.compras,
          stock: !ex.stock && (cat ? CATEGORIAS_CON_STOCK.has(cat.clave) : false),
        };
        for (const p of PLANTILLAS_EXTRA.filter((p) => p.categoria === categoriaInicial)) inicial[p.clave] = true;
        setSeleccionLote(inicial);
      }
    })();
  }, [categoriaInicial]);

  async function crearLote() {
    if (!empresaId || !categoria) return;
    const curadasSeleccionadas = PLANTILLAS_EXTRA.filter((p) => p.categoria === categoria.clave && seleccionLote[p.clave]);
    if (curadasSeleccionadas.length > 0 && planActivo === false) return activarPrueba();

    setCreandoLote(true);
    setError(null);
    const modulos: { nombre: string; columnas: Columna[]; plantilla: string | null }[] = [];
    if (seleccionLote.ventas) modulos.push({ nombre: "Ventas", columnas: plantillaVentas(), plantilla: null });
    if (seleccionLote.compras) modulos.push({ nombre: "Compras", columnas: plantillaCompras(), plantilla: null });
    if (seleccionLote.stock) modulos.push({ nombre: "Stock", columnas: plantillaStock(), plantilla: null });
    for (const p of curadasSeleccionadas) modulos.push({ nombre: p.nombre, columnas: p.columnas(), plantilla: p.clave });

    try {
      const res = await fetch("/api/datasets/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, modulos }),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "No se pudieron crear los módulos");
      router.refresh(); // el layout (desplegable "Módulos") quedaría desactualizado si no
      router.push("/dashboard");
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCreandoLote(false);
    }
  }

  async function activarPrueba() {
    if (!empresaId) return;
    setActivandoPrueba(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/activar-prueba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId }),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "No se pudo activar la prueba gratis");
      setPlanActivo(true);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setActivandoPrueba(false);
    }
  }

  function elegir(p: (typeof PLANTILLAS_EXTRA)[number]) {
    setElegida(p);
    setNombre(p.nombre);
    setError(null);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId || !elegida || !nombre.trim()) return;
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/datasets/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresaId,
          modulos: [{ nombre: nombre.trim(), columnas: elegida.columnas(), plantilla: elegida.clave }],
        }),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "No se pudo crear el módulo");
      router.refresh();
      router.push(`/dashboard/${body.dataset.id}`);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCreando(false);
    }
  }

  const plantillasDeLaCategoria = categoria ? PLANTILLAS_EXTRA.filter((p) => p.categoria === categoria.clave) : [];

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Agregar módulo</h1>
          <p className="suave" style={{ maxWidth: "62ch" }}>
            {!categoria
              ? "¿Qué tipo de negocio tienes? Según eso te mostramos las tablas que te podrían servir, además de Ventas y Compras."
              : "Elige una tabla lista para usar. Nace vacía, con los campos ya pensados para eso -- los puedes editar después desde “Editar módulo”."}
          </p>
        </div>
      </div>

      {!categoria && !elegida && (
        <div className="grilla-tablas">
          {CATEGORIAS_MODULOS.map((c) => (
            <button
              key={c.clave}
              type="button"
              className="tarjeta tarjeta-tabla"
              style={{ textAlign: "left", cursor: "pointer" }}
              onClick={() => setCategoria(c)}
            >
              <h3>{c.titulo}</h3>
              <p className="suave pequeno">{c.descripcion}</p>
            </button>
          ))}
        </div>
      )}

      {categoria && !elegida && modoLote && (
        <div className="tarjeta" style={{ maxWidth: 560 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>Recomendados para tu negocio</h2>
          <p className="suave pequeno">
            Destildados los que no quieras -- nacen vacíos, los puedes editar o borrar después.
            {existentes && (existentes.ventas || existentes.compras || existentes.stock) && (
              <> Ya tienes {[existentes.ventas && "Ventas", existentes.compras && "Compras", existentes.stock && "Stock"].filter(Boolean).join(", ")}, así que no se repiten.</>
            )}
          </p>

          {!existentes?.ventas && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0" }}>
              <input type="checkbox" checked={!!seleccionLote.ventas} onChange={(e) => setSeleccionLote((s) => ({ ...s, ventas: e.target.checked }))} style={{ marginTop: 3 }} />
              <span><strong>Ventas</strong> <span className="suave pequeno">— gratis para siempre</span></span>
            </label>
          )}
          {!existentes?.compras && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0" }}>
              <input type="checkbox" checked={!!seleccionLote.compras} onChange={(e) => setSeleccionLote((s) => ({ ...s, compras: e.target.checked }))} style={{ marginTop: 3 }} />
              <span><strong>Compras</strong> <span className="suave pequeno">— gratis para siempre</span></span>
            </label>
          )}
          {!existentes?.stock && CATEGORIAS_CON_STOCK.has(categoria.clave) && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0" }}>
              <input type="checkbox" checked={!!seleccionLote.stock} onChange={(e) => setSeleccionLote((s) => ({ ...s, stock: e.target.checked }))} style={{ marginTop: 3 }} />
              <span><strong>Stock</strong> <span className="suave pequeno">— gratis para siempre</span></span>
            </label>
          )}
          {plantillasDeLaCategoria.map((p) => (
            <label key={p.clave} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0" }}>
              <input type="checkbox" checked={!!seleccionLote[p.clave]} onChange={(e) => setSeleccionLote((s) => ({ ...s, [p.clave]: e.target.checked }))} style={{ marginTop: 3 }} />
              <span>
                <strong>{planActivo === false ? "🔒 " : ""}{p.nombre}</strong> <span className="suave pequeno">— {p.descripcion}</span>
              </span>
            </label>
          ))}

          {error && <p className="alerta alerta-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-fantasma" onClick={() => setModoLote(false)}>
              Prefiero elegir uno por uno
            </button>
            <button type="button" className="btn btn-fantasma" onClick={() => router.push("/dashboard")}>
              Ahora no
            </button>
            <button
              type="button"
              className="btn btn-primario"
              onClick={crearLote}
              disabled={creandoLote || activandoPrueba || Object.values(seleccionLote).every((v) => !v)}
            >
              {creandoLote
                ? "Creando..."
                : activandoPrueba
                  ? "Activando prueba gratis..."
                  : Object.entries(seleccionLote).some(
                      ([clave, marcado]) => marcado && plantillasDeLaCategoria.some((p) => p.clave === clave)
                    ) && planActivo === false
                    ? "Activar prueba gratis y crear"
                    : `Crear ${Object.values(seleccionLote).filter(Boolean).length} módulo(s)`}
            </button>
          </div>
        </div>
      )}

      {categoria && !elegida && !modoLote && (
        <>
          <button type="button" className="btn btn-fantasma" style={{ marginBottom: 14 }} onClick={() => setCategoria(null)}>
            ← Elegir otro tipo de negocio
          </button>
          <div className="grilla-tablas">
            {plantillasDeLaCategoria.map((p) => (
              <button
                key={p.clave}
                type="button"
                className="tarjeta tarjeta-tabla"
                style={{ textAlign: "left", cursor: "pointer" }}
                onClick={() => elegir(p)}
              >
                <h3>{planActivo === false ? "🔒 " : ""}{p.nombre}</h3>
                <p className="suave pequeno">{p.descripcion}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {elegida && (
        <div className="tarjeta" style={{ maxWidth: 460 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>{elegida.nombre}</h2>
          <p className="suave pequeno">{elegida.descripcion}</p>

          {planActivo === false ? (
            <>
              <p className="alerta" role="status">
                🔒 Este módulo es parte de la prueba gratis o el plan pago. Activa tu mes de prueba para crearlo, sin costo.
              </p>
              {error && <p className="alerta alerta-error" role="alert">{error}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button type="button" className="btn btn-fantasma" onClick={() => setElegida(null)} disabled={activandoPrueba}>
                  Elegir otra
                </button>
                <button type="button" className="btn btn-primario" onClick={activarPrueba} disabled={activandoPrueba}>
                  {activandoPrueba ? "Activando..." : "Activar prueba gratis"}
                </button>
                <Link href="/dashboard/billing" className="btn btn-fantasma">Ver planes</Link>
              </div>
            </>
          ) : (
            <form onSubmit={crear}>
              <div className="campo">
                <label htmlFor="nombre">Nombre del módulo</label>
                <input id="nombre" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} required />
              </div>

              {error && <p className="alerta alerta-error" role="alert">{error}</p>}

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button type="button" className="btn btn-fantasma" onClick={() => setElegida(null)} disabled={creando}>
                  Elegir otra
                </button>
                <button type="submit" className="btn btn-primario" disabled={creando || !nombre.trim() || !empresaId}>
                  {creando ? "Creando..." : "Crear módulo"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}
