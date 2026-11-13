"use client";

import { useState } from "react";
import type { Columna } from "@/lib/excel-parser";
import { OPERADORES_NUMERO, OPERADORES_TEXTO, EVENTOS, type Regla, type Operador, type Evento } from "@/lib/reglas";
import { enviarConfirmando } from "@/lib/confirmar";

// Las reglas (condición -> acción) de UN módulo, como su propia tarjeta --
// pantalla /dashboard/reglas, que lista una de estas por cada módulo con algo
// que mostrar (mismo criterio de la API /api/reglas). El guardado reusa el
// mismo PUT /api/datasets/[id] que ya usa EditarTabla -- mandando solo
// `reglas`, sin tocar columnas/nombre (el servidor conserva lo que no se manda).
//
// Modelo FFXII: el "detonante" (condición) puede ser CUALQUIER campo ya
// mapeado del módulo (no solo "Estado" -- Monto, Cantidad, Stock mínimo...),
// con el operador que corresponda a su tipo (igual/distinto para texto,
// también mayor/menor para número) -- mismo "umbral" que en el juego.
interface AjustarStockInfo {
  tipoModulo: "ventas" | "compras";
  stockNombre: string;
  cantidadLabel: string | null;
}

interface CandidatoSumarCampo {
  columnaEnlaceKey: string;
  columnaEnlaceLabel: string;
  columnaObjetivoKey: string;
  columnaObjetivoLabel: string;
  datasetObjetivoNombre: string;
}

type TipoAccion = "excluir_de_reportes" | "cambiar_estado" | "ajustar_stock" | "enviar_whatsapp" | "agregar_seguimiento" | "notificacion_push" | "sumar_campo_enlazado" | "eliminar_registro";

export default function ReglasModulo({
  datasetId,
  nombre,
  columnas,
  reglas,
  ajustarStockInfo,
  hayTelefono,
  hayCliente,
  candidatosSumarCampo,
}: {
  datasetId: string;
  nombre: string;
  columnas: Columna[];
  reglas: Regla[];
  // Este módulo clasifica como Ventas/Compras y su Producto está enlazado a un
  // dataset que "parece" Stock -- habilita "Ajustar Stock automáticamente"
  // como acción SELECCIONABLE (antes solo el sistema la creaba sola al
  // enlazar; un enlace armado a mano desde /dashboard/enlaces nunca la
  // generaba, así que no había forma de agregarla para ese caso). El detalle
  // real (tipo, a qué Stock, con qué columna) se usa para mostrarla armada
  // con su propia estructura "Si... entonces...", no solo un título.
  ajustarStockInfo: AjustarStockInfo | null;
  // "Enviar WhatsApp" necesita un campo rol "telefono" en ESTE módulo (a quién
  // escribirle); "Agregar a Seguimiento" necesita un campo rol "cliente".
  hayTelefono: boolean;
  hayCliente: boolean;
  // "Sumar un campo enlazado": un campo numérico candidato por cada columna de
  // este módulo que tenga un enlace -- ver /api/reglas (candidatosSumarCampo).
  candidatosSumarCampo: CandidatoSumarCampo[];
}) {
  const puedeAjustarStock = !!ajustarStockInfo;
  const [reglasLocal, setReglasLocal] = useState<Regla[]>(reglas);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  // Qué reglas están desplegadas en modo edición (vs. la línea compacta de
  // lectura). Una regla recién agregada arranca editando -- el resto del
  // módulo queda colapsado, mismo criterio que el <details> de la tarjeta.
  const [editando, setEditando] = useState<Record<string, boolean>>({});
  const toggleEditar = (id: string) => setEditando((e) => ({ ...e, [id]: !e[id] }));

  const cambiarRegla = (i: number, parche: Partial<Regla>) => setReglasLocal((rs) => rs.map((r, j) => (j === i ? ({ ...r, ...parche } as Regla) : r)));

  // Cualquier campo con significado mapeado puede ser el detonante -- ya no
  // solo los de rol "estado". Los que tienen opcionesFijas muestran un
  // desplegable de valores; el resto, texto o número libre según su tipo.
  // Excepción: la "Cantidad" de un módulo de Stock nace con rol null a
  // propósito (plantillaStock(), para no confundirse con otras plantillas
  // que combinan Producto+Cantidad) -- se deja entrar igual por su key fija.
  const columnasCondicion = columnas.filter((c) => c.rol !== null || c.key === "cantidad");
  const columnaDe = (key: string) => columnas.find((c) => c.key === key);
  const operadoresDe = (key: string) => (columnaDe(key)?.tipo === "numero" ? OPERADORES_NUMERO : OPERADORES_TEXTO);
  // Target de "cambiar_estado" ("registrar nuevo valor"): cualquier campo de
  // texto o número -- valorInput() ya elige select (si tiene opcionesFijas) o
  // input libre según corresponda.
  const columnasDestino = columnas.filter((c) => c.tipo === "texto" || c.tipo === "numero");
  // Solo una regla "ajustar_stock" tiene sentido por módulo -- si hubiera 2 activas
  // a la vez, un movimiento ajustaría el Stock el doble (aplicarReglasDesdeRegistro
  // dispara TODAS las que matcheen). Se oculta la opción en las demás filas una
  // vez que ya existe una.
  const hayAjustarStock = reglasLocal.some((r) => r.accion.tipo === "ajustar_stock");

  const claveCandidato = (c: CandidatoSumarCampo) => `${c.columnaEnlaceKey}::${c.columnaObjetivoKey}`;
  const candidatoDe = (clave: string) => candidatosSumarCampo.find((c) => claveCandidato(c) === clave);

  function condicionPorDefecto(): Regla["condicion"] {
    const primera = columnasCondicion[0];
    return primera ? { tipo: "campo", columnaKey: primera.key, operador: "es", valor: primera.opcionesFijas?.[0] ?? "" } : { tipo: "siempre" };
  }

  function agregarRegla() {
    const id = crypto.randomUUID();
    setEditando((e) => ({ ...e, [id]: true }));
    if (puedeAjustarStock && !hayAjustarStock) {
      setReglasLocal((rs) => [...rs, { id, activa: true, origen: "manual", condicion: { tipo: "siempre" }, accion: { tipo: "ajustar_stock" } }]);
      return;
    }
    if (columnasCondicion.length === 0) return;
    setReglasLocal((rs) => [...rs, { id, activa: true, origen: "manual", condicion: condicionPorDefecto(), accion: { tipo: "excluir_de_reportes" } }]);
  }

  // Icono + texto de una sola línea para la fila compacta (modo lectura) --
  // mismo vocabulario que ya se usa al construir/editar la regla, solo
  // resumido a lo legible: "Si <condición> -> <acción>".
  const ICONO_ACCION: Record<TipoAccion, string> = {
    excluir_de_reportes: "🚫",
    cambiar_estado: "🔄",
    ajustar_stock: "📦",
    enviar_whatsapp: "💬",
    agregar_seguimiento: "👀",
    notificacion_push: "🔔",
    sumar_campo_enlazado: "➕",
    eliminar_registro: "🗑️",
  };
  const OPERADOR_SIMBOLO: Record<Operador, string> = { es: "es", no_es: "no es", mayor: ">", mayor_igual: "≥", menor: "<", menor_igual: "≤" };

  // Detonante en texto -- solo se muestra si NO son los 3 (si es undefined o
  // están los 3, el detonante es "siempre que se guarde", el caso de siempre
  // hasta ahora, y mostrarlo sería ruido).
  function textoEvento(r: Regla): string {
    if (!r.evento || r.evento.length === 3) return "";
    return `[Al ${r.evento.map((e) => EVENTOS.find((x) => x.valor === e)?.etiqueta.toLowerCase()).join("/")}] `;
  }

  function textoCondicion(r: Regla): string {
    if (r.accion.tipo === "ajustar_stock" && ajustarStockInfo) {
      return `Si registra ${ajustarStockInfo.tipoModulo === "ventas" ? "una venta" : "una compra"}`;
    }
    const c = datosCondicion(r);
    if (!c.key) return "Siempre";
    const comparar = r.condicion.tipo === "campo" ? r.condicion.compararColumnaKey : undefined;
    const ladoDerecho = comparar ? `campo "${columnaDe(comparar)?.label ?? comparar}"` : `"${c.valor}"`;
    return `Si ${columnaDe(c.key)?.label ?? c.key} ${OPERADOR_SIMBOLO[c.operador]} ${ladoDerecho}`;
  }

  function textoAccion(r: Regla): string {
    const a = r.accion;
    if (a.tipo === "eliminar_registro") return "Eliminar este registro";
    if (a.tipo === "excluir_de_reportes") return "Excluir de reportes";
    if (a.tipo === "agregar_seguimiento") return "Agregar a Seguimiento";
    if (a.tipo === "cambiar_estado") return `Cambiar ${columnaDe(a.columnaKey)?.label ?? a.columnaKey} a "${a.valor}"`;
    if (a.tipo === "ajustar_stock") {
      if (!ajustarStockInfo) return "Ajustar Stock automáticamente";
      const cant = ajustarStockInfo.cantidadLabel ? `"${ajustarStockInfo.cantidadLabel}"` : "1";
      return `${ajustarStockInfo.tipoModulo === "ventas" ? "Restar" : "Sumar"} ${cant} de Cantidad en "${ajustarStockInfo.stockNombre}"`;
    }
    if (a.tipo === "enviar_whatsapp") return `Enviar WhatsApp${a.mensaje ? `: "${a.mensaje.slice(0, 40)}${a.mensaje.length > 40 ? "..." : ""}"` : ""}`;
    if (a.tipo === "notificacion_push") return `Notificar${a.titulo ? `: "${a.titulo}"` : ""}`;
    const c = candidatoDe(claveCandidato({ columnaEnlaceKey: a.columnaEnlaceKey, columnaObjetivoKey: a.columnaObjetivoKey } as CandidatoSumarCampo));
    return `Sumar ${a.delta} a ${c?.columnaObjetivoLabel ?? a.columnaObjetivoKey}${c ? ` en ${c.datasetObjetivoNombre}` : ""}`;
  }

  async function guardar() {
    setOcupado(true);
    setMensaje(null);
    const r = await enviarConfirmando(`/api/datasets/${datasetId}`, "PUT", { reglas: reglasLocal });
    setOcupado(false);
    if (r.cancelado) return;
    if (!r.ok) return setMensaje({ tipo: "error", texto: r.body.error ?? "No se pudieron guardar los cambios" });
    setMensaje({ tipo: "ok", texto: "Guardado." });
    setReglasLocal(r.body.reglas ?? reglasLocal);
  }

  // key/operador/valor de la condición de una regla, leyendo también el alias
  // legado "estado" (equivale a operador "es") para reglas guardadas antes de
  // esta generalización.
  function datosCondicion(r: Regla) {
    if (r.condicion.tipo === "campo") return { key: r.condicion.columnaKey, operador: r.condicion.operador, valor: r.condicion.valor };
    if (r.condicion.tipo === "estado") return { key: r.condicion.columnaKey, operador: "es" as const, valor: r.condicion.valor };
    return { key: "", operador: "es" as const, valor: "" };
  }

  function valorInput(key: string, valor: string, onChange: (v: string) => void, ariaLabel: string) {
    const col = columnaDe(key);
    if (col?.opcionesFijas?.length) {
      return (
        <select aria-label={ariaLabel} value={valor} onChange={(e) => onChange(e.target.value)}>
          {col.opcionesFijas.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    }
    return (
      <input
        aria-label={ariaLabel}
        type={col?.tipo === "numero" ? "number" : "text"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: col?.tipo === "numero" ? 100 : 140 }}
      />
    );
  }

  function cambiarAccion(i: number, r: Regla, tipo: TipoAccion) {
    if (tipo === "ajustar_stock") {
      cambiarRegla(i, { condicion: { tipo: "siempre" }, accion: { tipo } });
      return;
    }
    if (tipo === "sumar_campo_enlazado") {
      const primero = candidatosSumarCampo[0];
      cambiarRegla(i, { condicion: { tipo: "siempre" }, accion: primero ? { tipo, columnaEnlaceKey: primero.columnaEnlaceKey, columnaObjetivoKey: primero.columnaObjetivoKey, delta: 1 } : { tipo, columnaEnlaceKey: "", columnaObjetivoKey: "", delta: 1 } });
      return;
    }
    const cond = datosCondicion(r);
    const condicion: Regla["condicion"] = cond.key ? { tipo: "campo", columnaKey: cond.key, operador: cond.operador, valor: cond.valor } : condicionPorDefecto();
    if (tipo === "excluir_de_reportes" || tipo === "agregar_seguimiento" || tipo === "eliminar_registro") {
      cambiarRegla(i, { condicion, accion: { tipo } });
      return;
    }
    if (tipo === "enviar_whatsapp") {
      cambiarRegla(i, { condicion, accion: { tipo, mensaje: "" } });
      return;
    }
    if (tipo === "notificacion_push") {
      cambiarRegla(i, { condicion, accion: { tipo, titulo: "", mensaje: "" } });
      return;
    }
    const columnaKey = columnasDestino[0]?.key ?? (condicion.tipo === "campo" ? condicion.columnaKey : "");
    cambiarRegla(i, { condicion, accion: { tipo, columnaKey, valor: columnaDe(columnaKey)?.opcionesFijas?.[0] ?? "" } });
  }

  const iconosPresentes = [...new Set(reglasLocal.map((r) => ICONO_ACCION[r.accion.tipo as TipoAccion]))];

  return (
    <details className="tarjeta" style={{ marginBottom: 20 }}>
      <summary style={{ cursor: "pointer", display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, display: "inline" }}>{nombre}</h3>
        <span className="suave pequeno">{reglasLocal.length} regla{reglasLocal.length === 1 ? "" : "s"}</span>
        {iconosPresentes.length > 0 && <span>{iconosPresentes.join(" ")}</span>}
      </summary>

      {reglasLocal.length === 0 && (
        <p className="suave pequeno" style={{ marginTop: 10 }}>Este módulo todavía no tiene ninguna regla.</p>
      )}

      {reglasLocal.map((r, i) => {
        const cond = datosCondicion(r);
        const otraYaTieneAjustarStock = reglasLocal.some((r2, j) => j !== i && r2.accion.tipo === "ajustar_stock");

        if (!editando[r.id]) {
          return (
            <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--borde, #e5e5e5)" }}>
              <button
                type="button"
                aria-label={r.activa ? "Desactivar regla" : "Activar regla"}
                onClick={() => cambiarRegla(i, { activa: !r.activa })}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 }}
              >
                {r.activa ? "🟢" : "⚪"}
              </button>
              <span className="pequeno" style={{ flex: 1, opacity: r.activa ? 1 : 0.5 }}>
                {textoEvento(r)}{ICONO_ACCION[r.accion.tipo as TipoAccion]} {textoCondicion(r)} → {textoAccion(r)}
              </span>
              <button type="button" aria-label="Editar regla" onClick={() => toggleEditar(r.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0 }}>
                ✏️
              </button>
              <button type="button" aria-label="Quitar regla" onClick={() => setReglasLocal((rs) => rs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0 }}>
                🗑️
              </button>
            </div>
          );
        }

        return (
          <div key={r.id} className="fila-columna" style={{ gridTemplateColumns: "1fr auto", alignItems: "start", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--borde, #e5e5e5)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className="suave pequeno">Cuándo</span>
                {EVENTOS.map((ev) => (
                  <label key={ev.valor} className="pequeno" style={{ display: "flex", gap: 4, alignItems: "center", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      checked={!r.evento || r.evento.includes(ev.valor)}
                      onChange={(e) => {
                        const actuales = r.evento ?? EVENTOS.map((x) => x.valor);
                        const nuevos = e.target.checked ? [...actuales, ev.valor] : actuales.filter((x) => x !== ev.valor);
                        cambiarRegla(i, { evento: (nuevos.length ? nuevos : actuales) as Evento[] });
                      }}
                    />{" "}
                    {ev.etiqueta}
                  </label>
                ))}
              </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {r.accion.tipo !== "ajustar_stock" && (
                <>
                  <span className="suave pequeno">Campo</span>
                  <select
                    aria-label="Campo de la condición"
                    value={cond.key}
                    onChange={(e) => {
                      const key = e.target.value;
                      const operador = operadoresDe(key)[0].valor;
                      cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: key, operador, valor: columnaDe(key)?.opcionesFijas?.[0] ?? "" } });
                    }}
                  >
                    {columnasCondicion.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <select
                    aria-label="Operador"
                    value={cond.operador}
                    onChange={(e) => cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: cond.key, operador: e.target.value as Operador, valor: cond.valor } })}
                  >
                    {operadoresDe(cond.key).map((op) => <option key={op.valor} value={op.valor}>{op.etiqueta}</option>)}
                  </select>
                  <select
                    aria-label="Comparar contra"
                    value={r.condicion.tipo === "campo" && r.condicion.compararColumnaKey ? "campo" : "valor"}
                    onChange={(e) => {
                      if (e.target.value === "campo") {
                        const otra = columnasCondicion.find((c) => c.key !== cond.key) ?? columnasCondicion[0];
                        cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: cond.key, operador: cond.operador, valor: "", compararColumnaKey: otra?.key } });
                      } else {
                        cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: cond.key, operador: cond.operador, valor: columnaDe(cond.key)?.opcionesFijas?.[0] ?? "" } });
                      }
                    }}
                  >
                    <option value="valor">un valor</option>
                    <option value="campo">otro campo</option>
                  </select>
                  {r.condicion.tipo === "campo" && r.condicion.compararColumnaKey ? (
                    <select
                      aria-label="Campo a comparar"
                      value={r.condicion.compararColumnaKey}
                      onChange={(e) => cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: cond.key, operador: cond.operador, valor: "", compararColumnaKey: e.target.value } })}
                    >
                      {columnasCondicion.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  ) : (
                    valorInput(cond.key, cond.valor, (v) => cambiarRegla(i, { condicion: { tipo: "campo", columnaKey: cond.key, operador: cond.operador, valor: v } }), "Valor de la condición")
                  )}
                  <span className="suave pequeno">Acción</span>
                </>
              )}
              <select aria-label="Acción" value={r.accion.tipo} onChange={(e) => cambiarAccion(i, r, e.target.value as TipoAccion)}>
                <option value="excluir_de_reportes">Excluir de reportes</option>
                {columnasDestino.length > 0 && <option value="cambiar_estado">Cambiar un campo a...</option>}
                {puedeAjustarStock && !otraYaTieneAjustarStock && <option value="ajustar_stock">Ajustar Stock automáticamente</option>}
                {hayTelefono && <option value="enviar_whatsapp">Enviar WhatsApp</option>}
                {hayCliente && <option value="agregar_seguimiento">Agregar a Seguimiento</option>}
                <option value="notificacion_push">Notificación push</option>
                {candidatosSumarCampo.length > 0 && <option value="sumar_campo_enlazado">Sumar un campo enlazado</option>}
                <option value="eliminar_registro">Eliminar este registro</option>
              </select>

              {r.accion.tipo === "cambiar_estado" && (
                <>
                  <select
                    aria-label="Campo a cambiar"
                    value={r.accion.columnaKey}
                    onChange={(e) => cambiarRegla(i, { accion: { tipo: "cambiar_estado", columnaKey: e.target.value, valor: columnaDe(e.target.value)?.opcionesFijas?.[0] ?? "" } })}
                  >
                    {columnasDestino.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  {valorInput(r.accion.columnaKey, r.accion.valor, (v) => cambiarRegla(i, { accion: { tipo: "cambiar_estado", columnaKey: (r.accion as { columnaKey: string }).columnaKey, valor: v } }), "Nuevo valor")}
                </>
              )}

              {r.accion.tipo === "enviar_whatsapp" && (
                <input
                  aria-label="Mensaje de WhatsApp"
                  placeholder="Mensaje a enviar (texto fijo, sin {nombre} ni variables)"
                  value={r.accion.mensaje}
                  onChange={(e) => cambiarRegla(i, { accion: { tipo: "enviar_whatsapp", mensaje: e.target.value } })}
                  style={{ minWidth: 260, flex: 1 }}
                />
              )}

              {r.accion.tipo === "notificacion_push" && (
                <>
                  <input
                    aria-label="Título de la notificación"
                    placeholder="Título"
                    value={r.accion.titulo}
                    onChange={(e) => cambiarRegla(i, { accion: { tipo: "notificacion_push", titulo: e.target.value, mensaje: (r.accion as { mensaje: string }).mensaje } })}
                    style={{ width: 160 }}
                  />
                  <input
                    aria-label="Mensaje de la notificación"
                    placeholder="Mensaje"
                    value={r.accion.mensaje}
                    onChange={(e) => cambiarRegla(i, { accion: { tipo: "notificacion_push", titulo: (r.accion as { titulo: string }).titulo, mensaje: e.target.value } })}
                    style={{ minWidth: 200, flex: 1 }}
                  />
                </>
              )}

              {r.accion.tipo === "agregar_seguimiento" && (
                <p className="ayuda" style={{ margin: 0 }}>
                  Activa el seguimiento del cliente de este registro -- si deja de comprar, el aviso automático de
                  Seguimiento se encarga del resto.
                </p>
              )}

              {r.accion.tipo === "sumar_campo_enlazado" && (
                <>
                  <select
                    aria-label="Campo a sumar"
                    value={claveCandidato({ columnaEnlaceKey: r.accion.columnaEnlaceKey, columnaObjetivoKey: r.accion.columnaObjetivoKey } as CandidatoSumarCampo)}
                    onChange={(e) => {
                      const c = candidatoDe(e.target.value);
                      if (c) cambiarRegla(i, { accion: { tipo: "sumar_campo_enlazado", columnaEnlaceKey: c.columnaEnlaceKey, columnaObjetivoKey: c.columnaObjetivoKey, delta: r.accion.tipo === "sumar_campo_enlazado" ? r.accion.delta : 1 } });
                    }}
                  >
                    {candidatosSumarCampo.map((c) => (
                      <option key={claveCandidato(c)} value={claveCandidato(c)}>
                        {c.datasetObjetivoNombre} &gt; {c.columnaObjetivoLabel} (por {c.columnaEnlaceLabel})
                      </option>
                    ))}
                  </select>
                  <span className="suave pequeno">sumar</span>
                  <input
                    aria-label="Cuánto sumar"
                    type="number"
                    value={r.accion.delta}
                    onChange={(e) => cambiarRegla(i, { accion: { tipo: "sumar_campo_enlazado", columnaEnlaceKey: (r.accion as { columnaEnlaceKey: string }).columnaEnlaceKey, columnaObjetivoKey: (r.accion as { columnaObjetivoKey: string }).columnaObjetivoKey, delta: Number(e.target.value) || 0 } })}
                    style={{ width: 70 }}
                  />
                </>
              )}

              {r.accion.tipo === "ajustar_stock" && ajustarStockInfo && (
                <>
                  <span className="suave pequeno">Si</span>
                  <select disabled aria-label="Campo de la condición (fijo)"><option>Este módulo registra</option></select>
                  <select disabled aria-label="Operador (fijo)"><option>es</option></select>
                  <select disabled aria-label="Valor (fijo)">
                    <option>{ajustarStockInfo.tipoModulo === "ventas" ? "una Venta" : "una Compra"}</option>
                  </select>
                  <span className="suave pequeno">entonces</span>
                  <select disabled aria-label="Acción (fija)">
                    <option>{ajustarStockInfo.tipoModulo === "ventas" ? "Restar de" : "Sumar a"}</option>
                  </select>
                  <select disabled aria-label="Campo destino (fijo)"><option>Cantidad en "{ajustarStockInfo.stockNombre}"</option></select>
                  <select disabled aria-label="Cuánto (fijo)">
                    <option>{ajustarStockInfo.cantidadLabel ? `la "${ajustarStockInfo.cantidadLabel}" de cada movimiento` : "1 por movimiento (no hay campo Cantidad en este módulo)"}</option>
                  </select>
                  <p className="ayuda" style={{ margin: "4px 0 0", width: "100%" }}>
                    Fija: busca el producto exacto de cada venta/compra en el Stock enlazado, no un valor configurable como las demás reglas.
                  </p>
                </>
              )}
            </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button type="button" className="btn btn-primario" onClick={() => toggleEditar(r.id)}>
                ✓ Listo
              </button>
            </div>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        {(columnasCondicion.length > 0 || (puedeAjustarStock && !hayAjustarStock)) && (
          <button type="button" className="btn btn-secundario" onClick={agregarRegla}>
            + Agregar regla
          </button>
        )}
        <button type="button" className="btn btn-primario" onClick={guardar} disabled={ocupado}>
          {ocupado ? "Guardando..." : "Guardar cambios"}
        </button>
        {mensaje && <span className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status" style={{ margin: 0 }}>{mensaje.texto}</span>}
      </div>
    </details>
  );
}
