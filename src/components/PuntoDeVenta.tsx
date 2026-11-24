"use client";

import { useEffect, useMemo, useState } from "react";
import type { Columna } from "@/lib/excel-parser";
import { formatearMonto } from "@/lib/moneda";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

interface LineaCarrito {
  producto: string;
  cantidad: number;
  precioUnitario: number;
}

interface PreciosProducto { general?: number; mayorista?: number; minorista?: number }

// Sin mesas activado: todo va a esta única "mesa" invisible -- el POS se
// comporta exactamente igual que antes (un carrito, un cliente). Con mesas
// activado, cada una tiene su propio carrito/cliente, para un mozo que toma
// pedidos de varias mesas a la vez sin perder lo que ya cargó en las demás.
const MESA_UNICA = "__unica__";

// Punto de Venta: grilla táctil de productos (tocar para sumar al carrito) en
// vez del formulario de "Agregar registro" -- pensado para vender parado, no
// sentado llenando campos. Cada "cobrar" dispara un POST normal a
// /api/records/[ventasDatasetId] por línea del carrito, el mismo endpoint que
// ya usa el formulario manual -- así las Reglas/Recetas (ajuste de Stock,
// avisos, etc.) se disparan exactamente igual, sin reimplementar nada de eso.
//
// Sin fotos de producto (Frondix no tiene carga de imágenes todavía): cada
// cuadrado se pinta con un color generado a partir del nombre, para que la
// grilla sea reconocible de un vistazo igual que con fotos reales.
function colorDe(texto: string): string {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

export default function PuntoDeVenta() {
  const [modulosVentas, setModulosVentas] = useState<{ id: string; nombre: string }[] | null>(null);
  const [ventasDatasetId, setVentasDatasetId] = useState("");
  const [columnas, setColumnas] = useState<Columna[]>([]);
  const [productos, setProductos] = useState<string[]>([]);
  const [precios, setPrecios] = useState<Record<string, PreciosProducto>>({});
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [error, setError] = useState("");
  const [usarMesas, setUsarMesas] = useState(false);
  const [mesas, setMesas] = useState<string[]>([MESA_UNICA]);
  const [mesaActual, setMesaActual] = useState(MESA_UNICA);
  const [carritoPorMesa, setCarritoPorMesa] = useState<Record<string, LineaCarrito[]>>({});
  const [clientePorMesa, setClientePorMesa] = useState<Record<string, string>>({});
  const [cobrando, setCobrando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  // Ambientes: agrupa visualmente las mesas (Salón, Terraza, Barra...) -- solo
  // organiza, no es una entidad en la base, se pierde igual que las mesas al
  // cambiar de módulo o recargar.
  const [ambientes, setAmbientes] = useState<string[]>(["General"]);
  const [ambienteActual, setAmbienteActual] = useState("General");
  const [ambientePorMesa, setAmbientePorMesa] = useState<Record<string, string>>({});
  const [dividirEntre, setDividirEntre] = useState(1);
  // null = botón "+ Nuevo ambiente" normal; string = mostrando el input para
  // escribir el nombre (window.prompt() no es confiable en el WebView nativo
  // de Capacitor, así que esto va inline en vez de un prompt del navegador).
  const [nuevoAmbiente, setNuevoAmbiente] = useState<string | null>(null);
  // Comanda (para cocina, sin precios) / Pre-cuenta (para el cliente, con
  // precios) -- mismo mecanismo que "Exportar a PDF" en Reportes: imprimir
  // de verdad con window.print(), solo que acá el ticket que se imprime es
  // un nodo aparte que normalmente está oculto (ver .ticket-comanda en
  // globals.css) y el resto de la pantalla se marca "no-imprimir".
  const [ticketActivo, setTicketActivo] = useState<"comanda" | "precuenta" | null>(null);

  useEffect(() => {
    fetch("/api/datasets?tipo=ventas")
      .then((res) => res.json())
      .then((body) => {
        const lista = (body.datasets ?? []) as { id: string; nombre: string }[];
        setModulosVentas(lista);
        if (lista.length === 1) setVentasDatasetId(lista[0].id);
      })
      .catch(() => setModulosVentas([]));
  }, []);

  useEffect(() => {
    if (!ventasDatasetId) return;
    setCargando(true);
    setError("");
    setCarritoPorMesa({});
    setClientePorMesa({});
    setMesas([MESA_UNICA]);
    setMesaActual(MESA_UNICA);
    setAmbientes(["General"]);
    setAmbienteActual("General");
    setAmbientePorMesa({});
    setDividirEntre(1);
    setNuevoAmbiente(null);
    (async () => {
      // Mismo truco que la Papelera: pedir 1 registro trae igual `dataset.columnas` completo.
      const res = await fetch(`/api/records/${ventasDatasetId}?limite=1`);
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "No se pudo cargar el módulo"); setCargando(false); return; }
      const cols = (body.dataset?.columnas ?? []) as Columna[];
      setColumnas(cols);

      const cProducto = cols.find((c) => c.rol === "producto" && c.enlace);
      if (!cProducto?.enlace) {
        setError("Este módulo de Ventas no tiene el Producto enlazado a un Stock -- enlázalo desde \"Editar tabla y campos\" para usar el Punto de Venta.");
        setProductos([]);
        setCargando(false);
        return;
      }
      const resValores = await fetch(`/api/records/${cProducto.enlace.datasetId}/valores?columna=${cProducto.enlace.columnaKey}`);
      const bodyValores = await resValores.json();
      setProductos(bodyValores.valores ?? []);
      setPrecios(bodyValores.precios ?? {});
      setCodigos(bodyValores.codigos ?? {});
      setCargando(false);
    })();
  }, [ventasDatasetId]);

  const cMonto = useMemo(() => columnas.find((c) => c.rol === "monto"), [columnas]);
  const cProductoCol = useMemo(() => columnas.find((c) => c.rol === "producto"), [columnas]);
  const cCliente = useMemo(() => columnas.find((c) => c.rol === "cliente"), [columnas]);
  const cCantidad = useMemo(() => columnas.find((c) => c.rol === "cantidad"), [columnas]);
  const cFecha = useMemo(() => columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha"), [columnas]);

  function precioDe(producto: string): number {
    const p = precios[producto];
    return p?.general ?? p?.mayorista ?? p?.minorista ?? 0;
  }

  const carrito = carritoPorMesa[mesaActual] ?? [];
  const cliente = clientePorMesa[mesaActual] ?? (usarMesas && mesaActual !== MESA_UNICA ? mesaActual : "Cliente mostrador");
  function setCliente(valor: string) {
    setClientePorMesa((cs) => ({ ...cs, [mesaActual]: valor }));
  }
  function actualizarCarritoActual(fn: (c: LineaCarrito[]) => LineaCarrito[]) {
    setCarritoPorMesa((cs) => ({ ...cs, [mesaActual]: fn(cs[mesaActual] ?? []) }));
  }

  function agregarMesa() {
    const nombre = `Mesa ${mesas.length}`;
    setMesas((m) => [...m, nombre]);
    setAmbientePorMesa((a) => ({ ...a, [nombre]: ambienteActual }));
    setMesaActual(nombre);
  }

  function confirmarAmbiente() {
    const nombre = nuevoAmbiente?.trim();
    setNuevoAmbiente(null);
    if (!nombre) return;
    setAmbientes((a) => (a.includes(nombre) ? a : [...a, nombre]));
    setAmbienteActual(nombre);
  }

  function agregarAlCarrito(producto: string) {
    actualizarCarritoActual((c) => {
      const existente = c.find((l) => l.producto === producto);
      if (existente) return c.map((l) => (l.producto === producto ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...c, { producto, cantidad: 1, precioUnitario: precioDe(producto) }];
    });
  }

  function cambiarCantidad(producto: string, cantidad: number) {
    actualizarCarritoActual((c) => (cantidad <= 0 ? c.filter((l) => l.producto !== producto) : c.map((l) => (l.producto === producto ? { ...l, cantidad } : l))));
  }

  function cambiarPrecio(producto: string, precioUnitario: number) {
    actualizarCarritoActual((c) => c.map((l) => (l.producto === producto ? { ...l, precioUnitario } : l)));
  }

  const total = carrito.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);

  // Escanea un código de barras (requiere que Stock tenga una columna con rol
  // "codigo", ver el mapa `codigos` armado en /api/records/[datasetId]/valores)
  // y suma el producto encontrado al carrito, igual que tocar su cuadrado.
  async function escanear() {
    setEscaneando(true);
    setMensaje(null);
    try {
      const permiso = await BarcodeScanner.checkPermissions();
      if (permiso.camera !== "granted") {
        const pedido = await BarcodeScanner.requestPermissions();
        if (pedido.camera !== "granted") return;
      }
      const { barcodes } = await BarcodeScanner.scan();
      const codigo = barcodes[0]?.rawValue?.trim();
      if (!codigo) return;
      const producto = codigos[codigo];
      if (!producto) {
        setMensaje({ tipo: "error", texto: `No encontré ningún producto con el código "${codigo}" en Stock.` });
        return;
      }
      agregarAlCarrito(producto);
    } catch {
      // el usuario cerró la cámara o no hay una disponible -- no es un error que avisar
    } finally {
      setEscaneando(false);
    }
  }

  async function cobrar() {
    if (!cProductoCol || !cMonto || carrito.length === 0) return;
    setCobrando(true);
    setMensaje(null);
    const cantidadInicial = carrito.length;
    // Una línea = un POST, secuencial (no en paralelo): así una línea que
    // falla deja el resto del carrito intacto para reintentar, en vez de
    // arriesgarse a registrar algunas sí y otras no en cualquier orden.
    const pendientes = [...carrito];
    while (pendientes.length > 0) {
      const linea = pendientes[0];
      const datos: Record<string, unknown> = {
        [cProductoCol.key]: linea.producto,
        [cMonto.key]: linea.cantidad * linea.precioUnitario,
      };
      if (cCliente) datos[cCliente.key] = cliente.trim() || "Cliente mostrador";
      if (cCantidad) datos[cCantidad.key] = linea.cantidad;
      if (cFecha) datos[cFecha.key] = new Date().toISOString();

      const res = await fetch(`/api/records/${ventasDatasetId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setCobrando(false);
        actualizarCarritoActual(() => pendientes);
        setMensaje({ tipo: "error", texto: `Falló "${linea.producto}": ${body.error ?? "error desconocido"}. El resto del carrito sigue acá para reintentar.` });
        return;
      }
      pendientes.shift();
    }
    setCobrando(false);
    setMensaje({ tipo: "ok", texto: `Venta registrada: ${cantidadInicial} producto(s), total ${formatearMonto(total, "PEN")}.` });
    actualizarCarritoActual(() => []);
  }

  useEffect(() => {
    if (!ticketActivo) return;
    const t = setTimeout(() => window.print(), 50);
    const volver = () => setTicketActivo(null);
    window.addEventListener("afterprint", volver);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", volver); };
  }, [ticketActivo]);

  if (modulosVentas === null) return <p className="suave">Cargando...</p>;

  if (modulosVentas.length === 0) {
    return (
      <div className="tarjeta vacio">
        <h2 style={{ fontSize: 22 }}>No hay ningún módulo de Ventas todavía</h2>
        <p className="suave">Crea uno desde Inicio para poder usar el Punto de Venta.</p>
      </div>
    );
  }

  return (
    <>
      <div className="panel-cabecera no-imprimir">
        <div>
          <h1>Punto de Venta</h1>
          <p className="suave">Tocá un producto para sumarlo, ajustá cantidad o precio si hace falta, y cobrá.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label className="pequeno" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={usarMesas}
              onChange={(e) => {
                setUsarMesas(e.target.checked);
                setMesaActual(MESA_UNICA);
              }}
            />
            Usar mesas
          </label>
          {modulosVentas.length > 1 && (
            <select value={ventasDatasetId} onChange={(e) => setVentasDatasetId(e.target.value)}>
              <option value="" disabled>Elige un módulo de Ventas...</option>
              {modulosVentas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          )}
          {Capacitor.isNativePlatform() && Object.keys(codigos).length > 0 && (
            <button type="button" className="btn btn-secundario" onClick={escanear} disabled={escaneando}>
              {escaneando ? "Abriendo cámara..." : "📷 Escanear código"}
            </button>
          )}
        </div>
      </div>

      {usarMesas && (
        <div className="no-imprimir" style={{ marginBottom: 14 }}>
          {ambientes.map((amb) => (
            <div key={amb} style={{ marginBottom: 8 }}>
              <p className="suave pequeno" style={{ margin: "0 0 4px" }}>{amb}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {mesas.filter((m) => m !== MESA_UNICA && (ambientePorMesa[m] ?? "General") === amb).map((m) => {
                  const ocupada = (carritoPorMesa[m]?.length ?? 0) > 0;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMesaActual(m)}
                      className={`btn ${m === mesaActual ? "btn-primario" : "btn-secundario"}`}
                      style={{ position: "relative" }}
                    >
                      {m}
                      {ocupada && m !== mesaActual && <span style={{ marginLeft: 6 }}>●</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ambientes.length > 1 && (
              <select value={ambienteActual} onChange={(e) => setAmbienteActual(e.target.value)}>
                {ambientes.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
            <button type="button" className="btn btn-fantasma" onClick={agregarMesa}>+ Nueva mesa ({ambienteActual})</button>
            {nuevoAmbiente === null ? (
              <button type="button" className="btn btn-fantasma" onClick={() => setNuevoAmbiente("")}>+ Nuevo ambiente</button>
            ) : (
              <>
                <input
                  autoFocus
                  value={nuevoAmbiente}
                  onChange={(e) => setNuevoAmbiente(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmarAmbiente()}
                  placeholder="Ej. Salón, Terraza, Barra"
                  style={{ width: 160 }}
                />
                <button type="button" className="btn btn-primario" onClick={confirmarAmbiente}>Agregar</button>
                <button type="button" className="btn btn-fantasma" onClick={() => setNuevoAmbiente(null)}>Cancelar</button>
              </>
            )}
          </div>
        </div>
      )}

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {cargando && <p className="suave">Cargando productos...</p>}

      {!cargando && !error && ventasDatasetId && (
        <div className="no-imprimir" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "2 1 400px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            {productos.length === 0 && <p className="suave">El Stock enlazado todavía no tiene productos cargados.</p>}
            {productos.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => agregarAlCarrito(p)}
                style={{
                  background: colorDe(p),
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "16px 8px",
                  minHeight: 90,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  fontWeight: 700,
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14, lineHeight: 1.25 }}>{p}</span>
                {precioDe(p) > 0 && <span style={{ fontSize: 13, opacity: 0.9 }}>{formatearMonto(precioDe(p), "PEN")}</span>}
              </button>
            ))}
          </div>

          <div className="tarjeta" style={{ flex: "1 1 280px", position: "sticky", top: 20 }}>
            <h3 style={{ margin: 0 }}>Carrito{usarMesas && mesaActual !== MESA_UNICA ? ` - ${mesaActual}` : ""}</h3>
            <div className="campo" style={{ marginTop: 10 }}>
              <label className="pequeno">Cliente</label>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} />
            </div>

            {carrito.length === 0 && <p className="suave pequeno" style={{ marginTop: 14 }}>Todavía no agregaste nada.</p>}

            {carrito.map((l) => (
              <div key={l.producto} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                <span className="pequeno" style={{ flex: 1, minWidth: 90 }}>{l.producto}</span>
                <input
                  type="number"
                  min={0}
                  value={l.cantidad}
                  onChange={(e) => cambiarCantidad(l.producto, Number(e.target.value) || 0)}
                  style={{ width: 55 }}
                  aria-label={`Cantidad de ${l.producto}`}
                />
                <span className="suave pequeno">x</span>
                <input
                  type="number"
                  min={0}
                  value={l.precioUnitario}
                  onChange={(e) => cambiarPrecio(l.producto, Number(e.target.value) || 0)}
                  style={{ width: 70 }}
                  aria-label={`Precio de ${l.producto}`}
                />
                <strong style={{ width: 70, textAlign: "right" }}>{formatearMonto(l.cantidad * l.precioUnitario, "PEN")}</strong>
              </div>
            ))}

            {carrito.length > 0 && (
              <>
                <div className="campo" style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
                  <label className="pequeno">Dividir entre</label>
                  <input
                    type="number"
                    min={1}
                    value={dividirEntre}
                    onChange={(e) => setDividirEntre(Math.max(1, Number(e.target.value) || 1))}
                    style={{ width: 55 }}
                    aria-label="Dividir cuenta entre"
                  />
                  <span className="pequeno">personas</span>
                </div>
                {dividirEntre > 1 && (
                  <p className="suave pequeno" style={{ textAlign: "right", margin: "4px 0 0" }}>
                    {formatearMonto(total / dividirEntre, "PEN")} c/u
                  </p>
                )}
                <p style={{ marginTop: 10, fontSize: 18, fontWeight: 700, textAlign: "right" }}>
                  Total: {formatearMonto(total, "PEN")}
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn btn-secundario" style={{ flex: 1 }} onClick={() => setTicketActivo("comanda")}>
                    🖨️ Comanda
                  </button>
                  <button type="button" className="btn btn-secundario" style={{ flex: 1 }} onClick={() => setTicketActivo("precuenta")}>
                    🧾 Pre-cuenta
                  </button>
                </div>
                <button type="button" className="btn btn-primario" style={{ width: "100%", marginTop: 6 }} disabled={cobrando} onClick={cobrar}>
                  {cobrando ? "Cobrando..." : "Cobrar"}
                </button>
              </>
            )}

            {mensaje && (
              <p className={`alerta ${mensaje.tipo === "ok" ? "alerta-ok" : "alerta-error"}`} role="status" style={{ marginTop: 10 }}>
                {mensaje.texto}
              </p>
            )}
          </div>
        </div>
      )}

      <div className={`ticket-comanda ${ticketActivo === "comanda" ? "ticket-activo" : ""}`}>
        <h3>COMANDA{usarMesas && mesaActual !== MESA_UNICA ? ` - ${mesaActual}` : ""}</h3>
        <p>{new Date().toLocaleString("es-PE")}</p>
        <hr />
        {carrito.map((l) => (
          <div key={l.producto} className="linea"><span>{l.cantidad}x {l.producto}</span></div>
        ))}
      </div>

      <div className={`ticket-comanda ${ticketActivo === "precuenta" ? "ticket-activo" : ""}`}>
        <h3>PRE-CUENTA{usarMesas && mesaActual !== MESA_UNICA ? ` - ${mesaActual}` : ""}</h3>
        <p>No es un comprobante de pago</p>
        <hr />
        {carrito.map((l) => (
          <div key={l.producto} className="linea">
            <span>{l.cantidad}x {l.producto}</span>
            <span>{formatearMonto(l.cantidad * l.precioUnitario, "PEN")}</span>
          </div>
        ))}
        <hr />
        <div className="linea"><strong>Total</strong><strong>{formatearMonto(total, "PEN")}</strong></div>
        {dividirEntre > 1 && (
          <div className="linea"><span>Entre {dividirEntre} personas</span><span>{formatearMonto(total / dividirEntre, "PEN")} c/u</span></div>
        )}
      </div>
    </>
  );
}
