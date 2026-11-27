"use client";

import { useEffect, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import { INTERFACES_DISPONIBLES } from "@/lib/interfaces";
import type { Columna } from "@/lib/excel-parser";

// Prender/apagar las interfaces especializadas (Punto de Venta, Atención) que
// la barra de navegación ofrece cuando aplican -- ver lib/interfaces.ts. Una
// interfaz "aplica" por estructura (tiene un módulo de Ventas, o uno con
// Estado+contacto); este switch SOLO decide si, aplicando, igual se oculta
// del menú -- nunca bloquea la URL directa (/dashboard/pos sigue andando).
export default function InterfacesPage() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [aplican, setAplican] = useState<Set<string> | null>(null);
  const [desactivadas, setDesactivadas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = crearClienteBrowser();
      const sesion = await empresaDelUsuario(supabase);
      if (!sesion.ok) return setError(sesion.error);
      setEmpresaId(sesion.empresaId);

      const [{ data: datasetsCrudos }, { data: empresa }] = await Promise.all([
        supabase.from("datasets").select("nombre, columnas").eq("empresa_id", sesion.empresaId),
        supabase.from("empresas").select("interfaces_desactivadas").eq("id", sesion.empresaId).single(),
      ]);
      const datasets = (datasetsCrudos ?? []).map((d) => ({ nombre: d.nombre, columnas: d.columnas as Columna[] }));
      setAplican(new Set(INTERFACES_DISPONIBLES.filter((i) => i.aplica(datasets)).map((i) => i.key)));
      setDesactivadas(new Set((empresa?.interfaces_desactivadas as string[] | null) ?? []));
    })();
  }, []);

  async function cambiar(key: string, activa: boolean) {
    if (!empresaId) return;
    setGuardando(key);
    setError("");
    const res = await fetch("/api/interfaces/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, key, activa }),
    });
    setGuardando(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setError(body.error ?? "No se pudo cambiar");
    }
    setDesactivadas((d) => {
      const copia = new Set(d);
      if (activa) copia.delete(key); else copia.add(key);
      return copia;
    });
  }

  if (aplican === null) return <p className="suave">Cargando...</p>;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Interfaces</h1>
          <p className="suave">
            Qué atajos especiales (Punto de Venta, Atención) aparecen en la barra de navegación -- cada uno aparece
            solo con el módulo que le corresponde, y acá podés ocultarlo del menú aunque aplique.
          </p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}

      <div className="tarjeta">
        {INTERFACES_DISPONIBLES.map((i, idx) => {
          const aplica = aplican.has(i.key);
          const activa = !desactivadas.has(i.key);
          return (
            <div
              key={i.key}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "12px 0", borderTop: idx === 0 ? undefined : "1px solid var(--linea)",
              }}
            >
              <div>
                <strong>{i.label}</strong>
                {!aplica && (
                  <p className="suave pequeno" style={{ margin: "2px 0 0" }}>
                    {i.key === "pos" ? "Necesitas un módulo de Ventas para esto." : "Necesitas un módulo con Estado (lista cerrada) y Cliente o Teléfono, por ejemplo Reservas."}
                  </p>
                )}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, opacity: aplica ? 1 : 0.4 }}>
                <input
                  type="checkbox"
                  checked={activa}
                  disabled={!aplica || guardando === i.key}
                  onChange={(e) => cambiar(i.key, e.target.checked)}
                />
                {activa ? "Visible" : "Oculta"}
              </label>
            </div>
          );
        })}
      </div>
    </>
  );
}
