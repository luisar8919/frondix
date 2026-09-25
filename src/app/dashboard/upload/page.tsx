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
  // decisión del usuario sobre "la primera fila no es encabezado" (null = lo decide el parser)
  const [forzarSinEncabezado, setForzarSinEncabezado] = useState<boolean | null>(null);
  const [detectadoSinEncabezado, setDetectadoSinEncabezado] = useState(false);
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
    setForzarSinEncabezado(null);
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
    if (forzarSinEncabezado !== null) form.append("sinEncabezado", String(forzarSinEncabezado));
    fetch("/api/upload/preview", { method: "POST", body: form })
      .then((res) => res.json())
      .then((body) => {
        const cols: Columna[] = body.columnas ?? [];
        setColumnas(cols);
        setDetectadoSinEncabezado(Boolean(body.sinEncabezado));
        // arranca con lo que sugirió el parser; el usuario lo confirma o lo cambia
        setRoles(Object.fromEntries(cols.map((c) => [c.key, c.rol])));
      });
  }, [archivo, hojaElegida, forzarSinEncabezado]);

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
    form.append("sinEncabezado", String(sinEncabezado));

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const body = await res.json();
    setCargando(false);

    if (!res.ok) return setError(body.error ?? "Error subiendo el archivo");
    router.push(`/dashboard/${body.datasetId}`);
  }

  const haySospechosas = columnas?.some((c) => c.sospechosa) ?? false;
  const sinEncabezado = forzarSinEncabezado ?? detectadoSinEncabezado;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Subir Excel</h1>
          <p className="suave">Elegí tu archivo, revisá las columnas y listo.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} style={{ maxWidth: 760 }}>
        <div className="tarjeta" style={{ marginBottom: 16 }}>
          <label htmlFor="archivo">1. Tu archivo de Excel</label>
          <input id="archivo" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onArchivoElegido(e.target.files?.[0] ?? null)} required />
          <p className="ayuda">Formatos: .xlsx, .xls o .csv</p>

          {hojas && hojas.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <label htmlFor="hoja">Tu archivo tiene {hojas.length} hojas. ¿Cuál querés importar?</label>
              <select
                id="hoja"
                value={hojaElegida}
                onChange={(e) => {
                  setHojaElegida(e.target.value);
                  setForzarSinEncabezado(null);
                }}
              >
                {hojas.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <p className="ayuda">Importás una hoja por vez. Si querés varias, repetí el proceso o usá &quot;Generar tablas&quot;.</p>
            </div>
          )}
        </div>

        {columnas && columnas.length > 0 && (
          <div className="tarjeta" style={{ marginBottom: 16 }}>
            <h3>2. Revisá las columnas</h3>
            <p className="suave pequeno">Esto es lo que encontramos en la hoja &quot;{hojaElegida}&quot;.</p>

            <label className="campo-check" style={{ margin: "14px 0" }}>
              <input
                type="checkbox"
                checked={sinEncabezado}
                onChange={(e) => setForzarSinEncabezado(e.target.checked)}
              />
              <span>La primera fila no es un encabezado: es un dato (por ejemplo, una lista de productos).</span>
            </label>

            {sinEncabezado && (
              <p className="alerta alerta-ok">
                Se importan todas las filas y las columnas se nombran solas. Cambiales el nombre abajo.
              </p>
            )}
            {haySospechosas && !sinEncabezado && (
              <p className="alerta alerta-aviso">
                Esta hoja no parece tener un encabezado claro en algunas columnas (el título encontrado
                en realidad parece un dato, no un nombre). Revisá y corregí los nombres marcados. Si toda
                la primera fila es un dato, marcá la casilla de arriba.
              </p>
            )}

            <div>
              {columnas.map((c) => (
                <div key={c.key} className="fila-columna">
                  <div>
                    {c.sospechosa ? (
                      <input
                        aria-label={`Nombre de la columna ${c.label}`}
                        defaultValue={c.label}
                        placeholder="Nombre de esta columna"
                        onChange={(e) => setRenombres((r) => ({ ...r, [c.key]: e.target.value }))}
                      />
                    ) : (
                      <strong>{c.label}</strong>
                    )}
                  </div>
                  <span className="insignia">{c.tipo}</span>
                  <select
                    aria-label={`Qué representa la columna ${c.label}`}
                    value={roles[c.key] ?? ""}
                    onChange={(e) => elegirRol(c.key, (e.target.value || null) as RolColumna | null)}
                  >
                    <option value="">Sin rol especial</option>
                    {ROLES.map((r) => (
                      <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="ayuda">
              Indicá qué significa cada columna (monto, fecha, cliente...) para que el asistente pueda
              armarte resúmenes y avisos. Podés dejarlas sin rol.
            </p>
          </div>
        )}

        {columnas && (
          <div className="tarjeta">
            <label htmlFor="nombre-tabla">3. Nombre de la tabla</label>
            <input
              id="nombre-tabla"
              placeholder="Nombre de la tabla (ej. Clientes)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
            {error && <p className="alerta alerta-error" role="alert" style={{ marginTop: 14 }}>{error}</p>}
            <button type="submit" className="btn btn-primario btn-grande" style={{ marginTop: 16 }} disabled={cargando}>
              {cargando ? "Procesando..." : `Crear tabla desde "${hojaElegida}"`}
            </button>
          </div>
        )}

        {!columnas && error && <p className="alerta alerta-error" role="alert">{error}</p>}
      </form>
    </>
  );
}
