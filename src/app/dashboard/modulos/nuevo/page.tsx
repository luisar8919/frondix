"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import { PLANTILLAS_EXTRA } from "@/lib/plantillasModulo";

// Catálogo de módulos listos para usar más allá de Ventas/Compras (ver
// PLANTILLAS_EXTRA en lib/plantillasModulo.ts) -- un click elige la
// plantilla, confirma el nombre y crea el módulo ya con sus campos, mismo
// endpoint que ya usa "Empezar sin Excel" (/api/datasets/crear).
export default function NuevoModuloPage() {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [elegida, setElegida] = useState<(typeof PLANTILLAS_EXTRA)[number] | null>(null);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = crearClienteBrowser();
    (async () => {
      const r = await empresaDelUsuario(supabase);
      if (r.ok) setEmpresaId(r.empresaId);
    })();
  }, []);

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
        body: JSON.stringify({ empresaId, modulos: [{ nombre: nombre.trim(), columnas: elegida.columnas() }] }),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "No se pudo crear el módulo");
      router.push(`/dashboard/${body.dataset.id}`);
    } catch {
      setError("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Agregar módulo</h1>
          <p className="suave" style={{ maxWidth: "62ch" }}>
            Elige una tabla lista para usar, además de Ventas y Compras. Nace vacía, con los campos ya pensados
            para eso -- los puedes editar después desde &quot;Editar módulo&quot;.
          </p>
        </div>
      </div>

      {!elegida && (
        <div className="grilla-tablas">
          {PLANTILLAS_EXTRA.map((p) => (
            <button
              key={p.clave}
              type="button"
              className="tarjeta tarjeta-tabla"
              style={{ textAlign: "left", cursor: "pointer" }}
              onClick={() => elegir(p)}
            >
              <h3>{p.nombre}</h3>
              <p className="suave pequeno">{p.descripcion}</p>
            </button>
          ))}
        </div>
      )}

      {elegida && (
        <form onSubmit={crear} className="tarjeta" style={{ maxWidth: 460 }}>
          <h2 style={{ fontSize: 20, marginTop: 0 }}>{elegida.nombre}</h2>
          <p className="suave pequeno">{elegida.descripcion}</p>

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
    </>
  );
}
