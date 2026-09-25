"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";
import type { Columna } from "@/lib/excel-parser";
import { ROLES, type RolColumna } from "@/lib/roles";

export default function UploadPage() {
  const [nombre, setNombre] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hojas, setHojas] = useState<string[] | null>(null);
  const [hojaElegida, setHojaElegida] = useState("");
  const [columnas, setColumnas] = useState<Columna[] | null>(null);
  const [renombres, setRenombres] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<Record<string, RolColumna | null>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Paso 1: al elegir el archivo, leemos qué hojas tiene (un Excel real de
  // negocio casi nunca es una sola tabla — meses, caja, stock, etc.) y
  // dejamos que el usuario elija cuál importar, en vez de adivinar.
  async function onArchivoElegido(file: File | null) {
    setArchivo(file);
    setHojas(null);
    setHojaElegida("");
    setColumnas(null);
    setError(null);
    if (!file) return;

    const form = new FormData();
    form.append("archivo", file);
    const res = await fetch("/api/upload/hojas", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? "No se pudo leer el archivo");

    setHojas(body.hojas);
    setHojaElegida(body.hojas[0] ?? "");
  }

  // Paso 2: por cada hoja elegida, mostramos las columnas detectadas antes de
  // importar nada — así el usuario puede corregir las que el parser marca
  // como sospechosas (el título de la columna en realidad era un dato).
  useEffect(() => {
    if (!archivo || !hojaElegida) return;
    setColumnas(null);
    setRenombres({});

    const form = new FormData();
    form.append("archivo", archivo);
    form.append("hoja", hojaElegida);
    fetch("/api/upload/preview", { method: "POST", body: form })
      .then((res) => res.json())
      .then((body) => {
        const cols: Columna[] = body.columnas ?? [];
        setColumnas(cols);
        // arranca con lo que sugirió el parser; el usuario lo confirma o lo cambia
        setRoles(Object.fromEntries(cols.map((c) => [c.key, c.rol])));
      });
  }, [archivo, hojaElegida]);

  // Un rol solo puede tener una columna: al elegirlo en una, se libera de las demás.
  function elegirRol(key: string, rol: RolColumna | null) {
    setRoles((r) => {
      const siguiente = { ...r };
      if (rol) for (const k of Object.keys(siguiente)) if (siguiente[k] === rol) siguiente[k] = null;
      siguiente[key] = rol;
      return siguiente;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo || !hojaElegida) return;
    setCargando(true);
    setError(null);

    const supabase = crearClienteBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: miembro } = await supabase
      .from("miembros")
      .select("empresa_id")
      .eq("user_id", user!.id)
      .single();

    const form = new FormData();
    form.append("archivo", archivo);
    form.append("nombre", nombre);
    form.append("empresaId", miembro!.empresa_id);
    form.append("hoja", hojaElegida);
    if (Object.keys(renombres).length > 0) form.append("renombres", JSON.stringify(renombres));
    form.append("roles", JSON.stringify(roles));

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const body = await res.json();
    setCargando(false);

    if (!res.ok) return setError(body.error ?? "Error subiendo el archivo");
    router.push(`/dashboard/${body.datasetId}`);
  }

  const haySospechosas = columnas?.some((c) => c.sospechosa) ?? false;

  return (
    <main style={{ maxWidth: 560, margin: "40px auto" }}>
      <h1>Subir Excel</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onArchivoElegido(e.target.files?.[0] ?? null)} required />

        {hojas && hojas.length > 1 && (
          <label>
            Tu archivo tiene {hojas.length} hojas. ¿Cuál querés importar?
            <select value={hojaElegida} onChange={(e) => setHojaElegida(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
              {hojas.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </label>
        )}

        {columnas && columnas.length > 0 && (
          <div style={{ border: "1px solid #eee", borderRadius: 6, padding: 12 }}>
            <p style={{ margin: "0 0 8px", fontWeight: "bold" }}>Columnas detectadas</p>
            {haySospechosas && (
              <p style={{ color: "#a66", fontSize: 13, margin: "0 0 8px" }}>
                Esta hoja no parece tener un encabezado claro en algunas columnas (el título
                encontrado en realidad parece un dato, no un nombre). Revisá y corregí los
                nombres marcados antes de importar.
              </p>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              {columnas.map((c) => (
                <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {c.sospechosa ? (
                    <>
                      <span title="Nombre de columna sospechoso, revisalo" style={{ color: "#a66" }}>⚠</span>
                      <input
                        defaultValue={c.label}
                        placeholder="Nombre de esta columna"
                        onChange={(e) => setRenombres((r) => ({ ...r, [c.key]: e.target.value }))}
                        style={{ flex: 1 }}
                      />
                    </>
                  ) : (
                    <span>{c.label}</span>
                  )}
                  <span style={{ color: "#999", fontSize: 12 }}>({c.tipo})</span>
                  <select
                    value={roles[c.key] ?? ""}
                    onChange={(e) => elegirRol(c.key, (e.target.value || null) as RolColumna | null)}
                    title="¿Qué representa esta columna?"
                  >
                    <option value="">- sin rol -</option>
                    {ROLES.map((r) => (
                      <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p style={{ color: "#999", fontSize: 12, margin: "8px 0 0" }}>
              Indicá qué significa cada columna (monto, fecha, cliente...) para que el
              asistente pueda armarte resúmenes y avisos. Podés dejarlas sin rol.
            </p>
          </div>
        )}

        {columnas && (
          <input
            placeholder="Nombre de la tabla (ej. Clientes)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        )}

        {error && <p style={{ color: "crimson" }}>{error}</p>}
        {columnas && (
          <button type="submit" disabled={cargando}>
            {cargando ? "Procesando..." : `Crear tabla desde "${hojaElegida}"`}
          </button>
        )}
      </form>
    </main>
  );
}
