"use client";

import { useEffect, useMemo, useState } from "react";
import type { Columna } from "@/lib/excel-parser";
import { formatearMonto } from "@/lib/moneda";
import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";

interface LineaCarrito {
  id: string;
  producto: string;
  cantidad: number;
  precioUnitario: number;
  // Nota de texto libre de ESTA línea (ej. "sin cebolla") -- no es una columna
  // nueva en la base: se concatena al nombre del producto recién al cobrar
  // (ver cobrar()), así no hace falta tocar el schema de Ventas para esto.
  nota?: string;
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

export default function PuntoDeVenta() {
  const [modulosVentas, setModulosVentas] = useState<{ id: string; nombre: string }[] | null>(null);
  const [ventasDatasetId, setVentasDatasetId] = useState("");
  const [columnas, setColumnas] = useState<Columna[]>([]);
  const [productos, setProductos] = useState<string[]>([]);
  const [precios, setPrecios] = useState<Record<string, PreciosProducto>>({});
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  // Vacío = el Stock enlazado no tiene columna "cantidad" (o no es un Stock de
  // verdad) -- en ese caso nunca se desactiva nada, igual que antes.
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
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
  // Lista de precios a usar para los PRÓXIMOS productos que se agreguen al
  // carrito (no reprecia lo que ya está adentro -- cambiarla a mitad de venta
  // es un caso raro, simple y predecible: afecta solo de acá en adelante).
  const [listaPrecio, setListaPrecio] = useState<keyof PreciosProducto>("general");
  // Descuento global del pedido (no por línea) -- "%" sobre el total bruto, o
  // "monto" en soles fijos. Se reparte proporcionalmente sobre cada línea
  // recién al cobrar (ver cobrar()), así el Monto que queda en Ventas/Reportes
  // es el que de verdad se cobró, no el de lista.
  const [descuentoTipo, setDescuentoTipo] = useState<"%" | "monto">("%");
  const [descuentoValor, setDescuentoValor] = useState(0);
  // id de la línea cuyo input de nota está abierto (null = ninguna).
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const [extraAbierto, setExtraAbierto] = useState(false);
  const [extraNombre, setExtraNombre] = useState("");
  const [extraPrecio, setExtraPrecio] = useState("");
  // Unir mesas: la mesa ORIGEN queda marcada "unida" a la mesa DESTINO (no se
  // borra, para poder deshacerlo) -- tocarla salta directo al carrito de la
  // destino. Mover: simplemente traslada el carrito/cliente a otra mesa VACÍA
  // y deja la original libre, sin dejar ningún vínculo.
  const [mesasUnidas, setMesasUnidas] = useState<Record<string, string>>({});
  const [accionMesas, setAccionMesas] = useState<"unir" | "mover" | null>(null);
  const [mesaDestino, setMesaDestino] = useState("");
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
    setListaPrecio("general");
    setDescuentoTipo("%");
    setDescuentoValor(0);
    setNotaAbierta(null);
    setExtraAbierto(false);
    setExtraNombre("");
    setExtraPrecio("");
    setMesasUnidas({});
    setAccionMesas(null);
    setMesaDestino("");
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
      setCantidades(bodyValores.cantidades ?? {});
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
    return p?.[listaPrecio] ?? p?.general ?? p?.mayorista ?? p?.minorista ?? 0;
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

  // Junta el carrito de la mesa ACTUAL en el de `destino` y la marca "unida"
  // (no se borra: tocarla después salta directo al carrito de destino, y se
  // puede deshacer -- ver quitarUnion). Pensado para cuando 2 mesas se juntan
  // en el local y conviene cobrar todo junto.
  function unirMesa(destino: string) {
    setCarritoPorMesa((cs) => ({
      ...cs,
      [destino]: [...(cs[destino] ?? []), ...(cs[mesaActual] ?? [])],
      [mesaActual]: [],
    }));
    setMesasUnidas((u) => ({ ...u, [mesaActual]: destino }));
    setMesaActual(destino);
    setAccionMesas(null);
    setMesaDestino("");
  }

  function quitarUnion(origen: string) {
    setMesasUnidas((u) => {
      const { [origen]: _quitada, ...resto } = u;
      return resto;
    });
  }

  // Mueve el carrito/cliente de la mesa actual a otra (vacía) y deja la
  // original libre -- para cuando el cliente se cambia de mesa físicamente.
  function moverMesa(destino: string) {
    setCarritoPorMesa((cs) => ({ ...cs, [destino]: cs[mesaActual] ?? [], [mesaActual]: [] }));
    setClientePorMesa((cs) => ({ ...cs, [destino]: cs[mesaActual] ?? "" }));
    setMesaActual(destino);
    setAccionMesas(null);
    setMesaDestino("");
  }

  function confirmarAmbiente() {
    const nombre = nuevoAmbiente?.trim();
    setNuevoAmbiente(null);
    if (!nombre) return;
    setAmbientes((a) => (a.includes(nombre) ? a : [...a, nombre]));
    setAmbienteActual(nombre);
  }

  // Solo se considera "sin stock" si el producto realmente tiene un número de
  // cantidad registrado (ver cantidades, arriba) y ese número es <= 0 -- un
  // producto sin dato de cantidad (Stock sin esa columna, o dataset que no es
  // Stock) nunca se desactiva.
  function sinStock(producto: string): boolean {
    return (cantidades[producto] ?? Infinity) <= 0;
  }

  function agregarAlCarrito(producto: string) {
    if (sinStock(producto)) return;
    actualizarCarritoActual((c) => {
      // Dedup solo con líneas SIN nota (un toque rápido en la grilla suma
      // cantidad a lo ya cargado) -- una línea con nota propia (ej. "sin
      // cebolla") nunca se mezcla con otra del mismo producto.
      const existente = c.find((l) => l.producto === producto && !l.nota);
      if (existente) return c.map((l) => (l.id === existente.id ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...c, { id: crypto.randomUUID(), producto, cantidad: 1, precioUnitario: precioDe(producto) }];
    });
  }

  function cambiarCantidad(id: string, cantidad: number) {
    actualizarCarritoActual((c) => (cantidad <= 0 ? c.filter((l) => l.id !== id) : c.map((l) => (l.id === id ? { ...l, cantidad } : l))));
  }

  function cambiarPrecio(id: string, precioUnitario: number) {
    actualizarCarritoActual((c) => c.map((l) => (l.id === id ? { ...l, precioUnitario } : l)));
  }

  function cambiarNota(id: string, nota: string) {
    actualizarCarritoActual((c) => c.map((l) => (l.id === id ? { ...l, nota } : l)));
  }

  function eliminarLinea(id: string) {
    actualizarCarritoActual((c) => c.filter((l) => l.id !== id));
  }

  // "Adicionales" con precio propio (ej. Huevo +S/2) sin necesidad de un
  // catálogo armado de antemano -- se agregan como una línea más del carrito,
  // igual que cualquier producto, solo que con nombre/precio libres.
  function agregarExtra() {
    const nombre = extraNombre.trim();
    const precio = Number(extraPrecio);
    if (!nombre || !Number.isFinite(precio) || precio < 0) return;
    actualizarCarritoActual((c) => [...c, { id: crypto.randomUUID(), producto: nombre, cantidad: 1, precioUnitario: precio }]);
    setExtraNombre("");
    setExtraPrecio("");
    setExtraAbierto(false);
  }

  const totalBruto = carrito.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  // Factor único aplicado a cada línea al cobrar/mostrar -- nunca negativo ni
  // mayor a 1 (un descuento mayor al total simplemente deja todo en 0, no
  // "regala" de más).
  const factorDescuento =
    totalBruto <= 0
      ? 1
      : descuentoTipo === "%"
      ? Math.max(0, 1 - Math.min(100, descuentoValor) / 100)
      : Math.max(0, (totalBruto - descuentoValor) / totalBruto);
  const total = totalBruto * factorDescuento;
  const descuentoMonto = totalBruto - total;

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
        [cProductoCol.key]: linea.nota ? `${linea.producto} (${linea.nota})` : linea.producto,
        [cMonto.key]: linea.cantidad * linea.precioUnitario * factorDescuento,
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
          <label className="pequeno" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Lista de precios
            <select value={listaPrecio} onChange={(e) => setListaPrecio(e.target.value as keyof PreciosProducto)}>
              <option value="general">General</option>
              <option value="mayorista">Mayorista</option>
              <option value="minorista">Minorista</option>
            </select>
          </label>
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
                  const unidaA = mesasUnidas[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMesaActual(unidaA ?? m)}
                      className={`btn ${(unidaA ?? m) === mesaActual ? "btn-primario" : "btn-secundario"}`}
                      style={{ position: "relative", background: unidaA ? "var(--dorado-200, #e8c547)" : undefined }}
                      title={unidaA ? `Unida a ${unidaA}` : undefined}
                    >
                      {m}{unidaA ? ` → ${unidaA}` : ""}
                      {ocupada && m !== mesaActual && !unidaA && <span style={{ marginLeft: 6 }}>●</span>}
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

          {mesaActual !== MESA_UNICA && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
              {/* Las mesas "unidas" saltan directo al carrito de destino al tocarlas
                  (ver el onClick de arriba), así que mesaActual nunca ES el origen --
                  hay que buscar, al revés, qué mesas apuntan a ESTA como destino. */}
              {Object.entries(mesasUnidas).filter(([, destino]) => destino === mesaActual).map(([origen]) => (
                <button key={origen} type="button" className="btn btn-fantasma" onClick={() => quitarUnion(origen)}>
                  Deshacer unión con {origen}
                </button>
              ))}
              {accionMesas === null ? (
                <>
                  <button type="button" className="btn btn-fantasma" onClick={() => setAccionMesas("unir")}>Unir con...</button>
                  <button type="button" className="btn btn-fantasma" onClick={() => setAccionMesas("mover")}>Mover a...</button>
                </>
              ) : (
                <>
                  <select value={mesaDestino} onChange={(e) => setMesaDestino(e.target.value)}>
                    <option value="">
                      {accionMesas === "unir" ? "Elige la mesa destino..." : "Elige la mesa vacía..."}
                    </option>
                    {mesas
                      .filter((m) => m !== MESA_UNICA && m !== mesaActual && (accionMesas === "unir" || (carritoPorMesa[m]?.length ?? 0) === 0))
                      .map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primario"
                    disabled={!mesaDestino}
                    onClick={() => (accionMesas === "unir" ? unirMesa(mesaDestino) : moverMesa(mesaDestino))}
                  >
                    Confirmar
                  </button>
                  <button type="button" className="btn btn-fantasma" onClick={() => { setAccionMesas(null); setMesaDestino(""); }}>Cancelar</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {cargando && <p className="suave">Cargando productos...</p>}

      {!cargando && !error && ventasDatasetId && (
        <div className="no-imprimir" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "2 1 400px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            {productos.length === 0 && <p className="suave">El Stock enlazado todavía no tiene productos cargados.</p>}
            {productos.map((p) => {
              const agotado = sinStock(p);
              return (
                <button
                  key={p}
                  type="button"
                  disabled={agotado}
                  onClick={() => agregarAlCarrito(p)}
                  title={agotado ? "Sin stock" : undefined}
                  style={{
                    background: agotado ? "var(--fondo-200, #e5e5e5)" : "var(--verde-600)",
                    color: agotado ? "var(--texto-suave, #888)" : "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "16px 8px",
                    minHeight: 90,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    cursor: agotado ? "not-allowed" : "pointer",
                    opacity: agotado ? 0.6 : 1,
                    fontWeight: 700,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1.25 }}>{p}</span>
                  <span style={{ fontSize: 13, opacity: 0.9 }}>
                    {agotado ? "Sin stock" : precioDe(p) > 0 ? formatearMonto(precioDe(p), "PEN") : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="tarjeta" style={{ flex: "1 1 280px", position: "sticky", top: 20 }}>
            <h3 style={{ margin: 0 }}>Carrito{usarMesas && mesaActual !== MESA_UNICA ? ` - ${mesaActual}` : ""}</h3>
            <div className="campo" style={{ marginTop: 10 }}>
              <label className="pequeno">Cliente</label>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} />
            </div>

            {carrito.length === 0 && <p className="suave pequeno" style={{ marginTop: 14 }}>Todavía no agregaste nada.</p>}

            {carrito.map((l) => (
              <div key={l.id} style={{ borderBottom: "1px solid var(--linea)", padding: "8px 0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 52px 68px 72px auto", gap: 6, alignItems: "center" }}>
                  <span className="pequeno" style={{ gridColumn: "1 / -1" }}>{l.producto}{l.nota ? ` (${l.nota})` : ""}</span>
                  <input
                    type="number"
                    min={0}
                    value={l.cantidad}
                    onChange={(e) => cambiarCantidad(l.id, Number(e.target.value) || 0)}
                    style={{ width: "100%" }}
                    aria-label={`Cantidad de ${l.producto}`}
                  />
                  <input
                    type="number"
                    min={0}
                    value={l.precioUnitario}
                    onChange={(e) => cambiarPrecio(l.id, Number(e.target.value) || 0)}
                    style={{ width: "100%" }}
                    aria-label={`Precio de ${l.producto}`}
                  />
                  <strong style={{ textAlign: "right", fontSize: 14 }}>{formatearMonto(l.cantidad * l.precioUnitario, "PEN")}</strong>
                  <div style={{ display: "flex" }}>
                    <button type="button" className="btn btn-fantasma" style={{ padding: "4px 6px" }} title="Nota" onClick={() => setNotaAbierta(notaAbierta === l.id ? null : l.id)}>📝</button>
                    <button type="button" className="btn btn-fantasma" style={{ padding: "4px 6px" }} title="Quitar" onClick={() => eliminarLinea(l.id)}>🗑️</button>
                  </div>
                </div>
                {notaAbierta === l.id && (
                  <input
                    autoFocus
                    value={l.nota ?? ""}
                    onChange={(e) => cambiarNota(l.id, e.target.value)}
                    placeholder="Ej. sin cebolla, bien cocido..."
                    style={{ width: "100%", marginTop: 4 }}
                    aria-label={`Nota de ${l.producto}`}
                  />
                )}
              </div>
            ))}

            {carrito.length > 0 && (extraAbierto ? (
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <input value={extraNombre} onChange={(e) => setExtraNombre(e.target.value)} placeholder="Ej. Huevo" style={{ flex: 1, minWidth: 90 }} />
                <input type="number" min={0} value={extraPrecio} onChange={(e) => setExtraPrecio(e.target.value)} placeholder="Precio" style={{ width: 70 }} />
                <button type="button" className="btn btn-primario" onClick={agregarExtra}>Agregar</button>
                <button type="button" className="btn btn-fantasma" onClick={() => { setExtraAbierto(false); setExtraNombre(""); setExtraPrecio(""); }}>Cancelar</button>
              </div>
            ) : (
              <button type="button" className="btn btn-fantasma" style={{ marginTop: 10 }} onClick={() => setExtraAbierto(true)}>+ Agregar extra (ej. adicional con precio propio)</button>
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

                <div className="campo" style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center" }}>
                  <label className="pequeno">Descuento</label>
                  <select value={descuentoTipo} onChange={(e) => setDescuentoTipo(e.target.value as "%" | "monto")} style={{ width: 70 }}>
                    <option value="%">%</option>
                    <option value="monto">S/</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={descuentoValor}
                    onChange={(e) => setDescuentoValor(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: 70 }}
                    aria-label="Valor del descuento"
                  />
                </div>

                {descuentoMonto > 0 && (
                  <p className="suave pequeno" style={{ textAlign: "right", margin: "4px 0 0" }}>
                    Subtotal {formatearMonto(totalBruto, "PEN")} - Descuento {formatearMonto(descuentoMonto, "PEN")}
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
          <div key={l.id} className="linea"><span>{l.cantidad}x {l.producto}{l.nota ? ` (${l.nota})` : ""}</span></div>
        ))}
      </div>

      <div className={`ticket-comanda ${ticketActivo === "precuenta" ? "ticket-activo" : ""}`}>
        <h3>PRE-CUENTA{usarMesas && mesaActual !== MESA_UNICA ? ` - ${mesaActual}` : ""}</h3>
        <p>No es un comprobante de pago</p>
        <hr />
        {carrito.map((l) => (
          <div key={l.id} className="linea">
            <span>{l.cantidad}x {l.producto}{l.nota ? ` (${l.nota})` : ""}</span>
            <span>{formatearMonto(l.cantidad * l.precioUnitario, "PEN")}</span>
          </div>
        ))}
        <hr />
        {descuentoMonto > 0 && (
          <>
            <div className="linea"><span>Subtotal</span><span>{formatearMonto(totalBruto, "PEN")}</span></div>
            <div className="linea"><span>Descuento</span><span>-{formatearMonto(descuentoMonto, "PEN")}</span></div>
          </>
        )}
        <div className="linea"><strong>Total</strong><strong>{formatearMonto(total, "PEN")}</strong></div>
        {dividirEntre > 1 && (
          <div className="linea"><span>Entre {dividirEntre} personas</span><span>{formatearMonto(total / dividirEntre, "PEN")} c/u</span></div>
        )}
      </div>
    </>
  );
}
