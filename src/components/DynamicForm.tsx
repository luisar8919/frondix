"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import type { Columna } from "@/lib/excel-parser";
import { tipoModulo, camposObligatorios, admiteNegativos } from "@/lib/roles";

const inputType: Record<Columna["tipo"], string> = {
  texto: "text",
  numero: "number",
  fecha: "date",
};

const NUEVO = "__nuevo__";

const sustantivoEnlace: Record<string, string> = {
  cliente: "cliente",
  proveedor: "proveedor",
  producto: "producto",
};

export default function DynamicForm({
  columnas,
  opciones,
  etiquetasEnlace,
  onSubmit,
  inicial,
  textoBoton = "Agregar registro",
  onCancelar,
}: {
  columnas: Columna[];
  // valores permitidos por columna enlazada (autocompletado)
  opciones?: Record<string, string[]>;
  // a qué tabla > columna apunta cada columna enlazada (texto de ayuda)
  etiquetasEnlace?: Record<string, string>;
  // devuelve un mensaje de error si el servidor rechazó el registro, o null si se guardó
  onSubmit: (data: Record<string, unknown>) => Promise<string | null>;
  // al editar: datos actuales del registro; el formulario no se vacía al guardar
  inicial?: Record<string, unknown>;
  textoBoton?: string;
  onCancelar?: () => void;
}) {
  // Un registro nuevo (no al editar) arranca con la fecha de hoy: es el dato que más se
  // olvida cargar, y sin fecha una tabla no puede aparecer en Seguimiento. También se
  // usa para "limpiar" el formulario tras guardar (ver handleSubmit) -- si no, el
  // segundo registro de la sesión en adelante perdía este valor por defecto.
  const valoresIniciales = () =>
    Object.fromEntries(
      columnas.map((c) => {
        const v = inicial?.[c.key];
        if (v !== null && v !== undefined) return [c.key, c.tipo === "fecha" ? String(v).slice(0, 10) : String(v)];
        if (!inicial && c.tipo === "fecha" && !c.enlace) return [c.key, new Date().toISOString().slice(0, 10)];
        return [c.key, ""];
      })
    );
  // Para una columna enlazada: si no hay ningún valor existente para elegir, o el
  // registro que se está editando trae un valor que ya no está en la lista, arranca
  // directo en modo "escribir uno nuevo" -- no tiene sentido mostrar un desplegable
  // con una sola opción ("Agregar nuevo") cuando ni siquiera hay entre qué elegir.
  const modoNuevoInicial = () =>
    Object.fromEntries(
      columnas
        .filter((c) => c.enlace)
        .map((c) => {
          const existentes = opciones?.[c.key] ?? [];
          const valorActual = inicial?.[c.key] != null ? String(inicial[c.key]) : "";
          const sinOpciones = existentes.length === 0;
          const valorNoListado = valorActual !== "" && !existentes.includes(valorActual);
          return [c.key, sinOpciones || valorNoListado];
        })
    );

  const [valores, setValores] = useState<Record<string, string>>(valoresIniciales);
  const [modoNuevo, setModoNuevo] = useState<Record<string, boolean>>(modoNuevoInicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState<string | null>(null); // key de la columna que está escaneando

  const tipo = tipoModulo(columnas.map((c) => c.rol));
  const obligatorios = new Set(camposObligatorios(tipo));

  // Escanear el código de barras de un artículo comprado y usarlo directo
  // como Producto -- mismo patrón que el buscador de Stock en
  // dashboard/[datasetId]/page.tsx (cámara nativa vía ML Kit).
  async function escanear(c: Columna) {
    setEscaneando(c.key);
    try {
      const permiso = await BarcodeScanner.checkPermissions();
      if (permiso.camera !== "granted") {
        const pedido = await BarcodeScanner.requestPermissions();
        if (pedido.camera !== "granted") return;
      }
      const { barcodes } = await BarcodeScanner.scan();
      const valor = barcodes[0]?.rawValue;
      if (valor) setValores((v) => ({ ...v, [c.key]: valor }));
    } catch {
      // el usuario cerró la cámara o no hay una disponible -- no es un error que avisar
    } finally {
      setEscaneando(null);
    }
  }

  function cambiarEnlace(c: Columna, valor: string) {
    if (valor === NUEVO) {
      setModoNuevo({ ...modoNuevo, [c.key]: true });
      setValores({ ...valores, [c.key]: "" });
    } else {
      setValores({ ...valores, [c.key]: valor });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Campos obligatorios según sea un módulo de Ventas o Compras (ver
    // camposObligatorios en roles.ts) -- sin esto se podían guardar ventas sin
    // monto ni producto, que después ni Reportes ni Seguimiento pueden usar.
    const faltante = columnas.find((c) => c.rol && obligatorios.has(c.rol) && !valores[c.key]?.trim());
    if (faltante) return setError(`Falta completar "${faltante.label}".`);

    // Un monto/costo/cantidad negativo es casi siempre un error de tipeo, no una
    // operación real (el stock SÍ admite negativos, por eso usa admiteNegativos
    // y no un simple "todo número debe ser positivo").
    const negativo = columnas.find((c) => c.tipo === "numero" && !admiteNegativos(c.rol) && Number(valores[c.key]) < 0);
    if (negativo) return setError(`"${negativo.label}" no puede ser negativo.`);

    setEnviando(true);
    // Guardar con el mismo tipo que los datos importados (numero, fecha ISO), no como texto.
    const datos: Record<string, unknown> = {};
    for (const c of columnas) {
      const v = valores[c.key];
      const vLimpio = c.tipo === "texto" ? v?.trim() : v;
      if (vLimpio === undefined || vLimpio === "") datos[c.key] = null;
      else if (c.tipo === "numero") datos[c.key] = Number(vLimpio);
      else if (c.tipo === "fecha") datos[c.key] = `${vLimpio}T00:00:00.000Z`;
      else datos[c.key] = vLimpio;
    }
    const fallo = await onSubmit(datos);
    setEnviando(false);
    if (fallo) return setError(fallo);
    setError(null);
    if (!inicial) {
      setValores(valoresIniciales());
      setModoNuevo(modoNuevoInicial());
    }
  }

  return (
    // noValidate: sin esto, el navegador bloqueaba un número negativo con su
    // propio aviso nativo (en el idioma del navegador, no necesariamente
    // español) ANTES de que corriera la validación de abajo -- el mensaje
    // propio ("X no puede ser negativo") nunca llegaba a mostrarse.
    <form onSubmit={handleSubmit} noValidate>
      <div className="grilla-form">
        {columnas.map((c) => {
          const enlazada = !!c.enlace;
          const esObligatorio = !!c.rol && obligatorios.has(c.rol);
          const enModoNuevo = enlazada && modoNuevo[c.key];
          const sustantivo = (c.rol && sustantivoEnlace[c.rol]) || "valor";
          const hayExistentes = (opciones?.[c.key] ?? []).length > 0;
          return (
            <div key={c.key}>
              <label htmlFor={`campo-${c.key}`}>
                {c.label}
                {esObligatorio && <span style={{ color: "var(--error)" }}> *</span>}
              </label>
              {enlazada && !enModoNuevo ? (
                <select
                  id={`campo-${c.key}`}
                  value={valores[c.key] ?? ""}
                  onChange={(e) => cambiarEnlace(c, e.target.value)}
                >
                  <option value="" disabled>
                    Elige {sustantivo}...
                  </option>
                  {(opciones?.[c.key] ?? []).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                  <option value={NUEVO}>+ Agregar nuevo {sustantivo}</option>
                </select>
              ) : (
                <input
                  id={`campo-${c.key}`}
                  type={enlazada ? "text" : inputType[c.tipo]}
                  step={c.tipo === "numero" && !enlazada ? "any" : undefined}
                  min={c.tipo === "numero" && !enlazada && !admiteNegativos(c.rol) ? 0 : undefined}
                  inputMode={c.tipo === "numero" && !enlazada ? "decimal" : undefined}
                  autoComplete={enlazada ? "off" : undefined}
                  list={enlazada && hayExistentes ? `lista-${c.key}` : undefined}
                  placeholder={enModoNuevo ? `Nombre del ${sustantivo} nuevo` : undefined}
                  autoFocus={enModoNuevo}
                  value={valores[c.key] ?? ""}
                  onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}
                />
              )}
              {c.rol === "producto" && tipo === "compras" && Capacitor.isNativePlatform() && (!enlazada || enModoNuevo) && (
                <button
                  type="button"
                  className="btn btn-fantasma pequeno"
                  style={{ padding: "2px 8px", marginTop: 4 }}
                  onClick={() => escanear(c)}
                  disabled={escaneando === c.key}
                >
                  {escaneando === c.key ? "Abriendo cámara..." : "📷 Escanear código"}
                </button>
              )}
              {enlazada && hayExistentes && (
                // Autocompletado nativo: al tipear coincide con un valor ya enlazado y
                // lo sugiere -- usarlo (clic o Tab) asocia el registro sin tener que
                // cambiar a la vista de desplegable.
                <datalist id={`lista-${c.key}`}>
                  {(opciones?.[c.key] ?? []).map((v) => <option key={v} value={v} />)}
                </datalist>
              )}
              {enlazada && (
                <>
                  {enModoNuevo && hayExistentes && (
                    <button
                      type="button"
                      className="btn btn-fantasma pequeno"
                      style={{ padding: "2px 8px", marginTop: 4 }}
                      onClick={() => setModoNuevo({ ...modoNuevo, [c.key]: false })}
                    >
                      Elegir uno existente
                    </button>
                  )}
                  <p className="ayuda">Enlazada con {etiquetasEnlace?.[c.key] ?? "otro módulo"}</p>
                </>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="alerta alerta-error" role="alert" style={{ marginTop: 14, marginBottom: 0 }}>{error}</p>}
      <button type="submit" className="btn btn-primario" style={{ marginTop: 18 }} disabled={enviando}>
        {enviando ? "Guardando..." : textoBoton}
      </button>
      {onCancelar && (
        <button type="button" className="btn btn-fantasma" style={{ marginTop: 18, marginLeft: 8 }} onClick={onCancelar}>Cancelar</button>
      )}
    </form>
  );
}
