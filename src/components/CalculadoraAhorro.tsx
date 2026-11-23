"use client";

import { useState } from "react";

// Mismo precio que la sección de Precios (S/ 30/mes, plan Completo) -- si ese
// precio cambia, cambiarlo también acá.
const PRECIO_FRONDIX = 30;

// Cada tarea mapea a una función real de Frondix (no son categorías inventadas):
// "ventas" -> carga/orden de ventas y compras (el Excel); "stock" -> stock.ts +
// valorizacionInventario.ts + alertas de stock; "facturacion" -> integración
// FactPro (factura/boleta electrónica real ante SUNAT); "cobranza" ->
// seguimiento.ts + cuentas por cobrar + notificaciones; "reportes" -> reportes.ts
// (flujo de caja, balance). `activo` son los defaults más universales -- las
// demás las prende el visitante si le aplican a su negocio.
const TAREAS = [
  { clave: "ventas", etiqueta: "Cargar y ordenar tus ventas y compras", montoDefault: 1500, activo: true },
  { clave: "stock", etiqueta: "Controlar y alertar tu stock/inventario", montoDefault: 900, activo: true },
  { clave: "facturacion", etiqueta: "Armar comprobantes y coordinar con tu contador", montoDefault: 250, activo: false },
  { clave: "cobranza", etiqueta: "Hacer seguimiento y cobrar a clientes morosos", montoDefault: 600, activo: false },
  { clave: "reportes", etiqueta: "Armar reportes de ventas y flujo de caja", montoDefault: 350, activo: false },
];

// Beneficios de ley que se suman al sueldo bruto al contratar a alguien en
// planilla (Perú): se expresan como % porque cada uno equivale a un pago
// adicional repartido en el año, no a un gasto aparte cada mes.
const BENEFICIOS = [
  { clave: "cts", etiqueta: "CTS", pct: 0.0833, nota: "~1 sueldo extra al año (mayo y noviembre)" },
  { clave: "vacaciones", etiqueta: "Vacaciones", pct: 0.0833, nota: "30 días pagados sin que te atiendan" },
  { clave: "licencias", etiqueta: "Licencias médicas", pct: 0.05, nota: "primeros días de descanso médico, a cargo tuyo" },
];

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

export default function CalculadoraAhorro() {
  const [tareas, setTareas] = useState(
    TAREAS.map((t) => ({ ...t, monto: t.montoDefault }))
  );

  function toggleTarea(clave: string) {
    setTareas((prev) => prev.map((t) => (t.clave === clave ? { ...t, activo: !t.activo } : t)));
  }

  function cambiarMonto(clave: string, monto: number) {
    setTareas((prev) => prev.map((t) => (t.clave === clave ? { ...t, monto: Math.max(0, monto) } : t)));
  }

  const sueldo = tareas.reduce((suma, t) => suma + (t.activo ? t.monto : 0), 0);
  const extra = BENEFICIOS.reduce((suma, b) => suma + sueldo * b.pct, 0);
  const costoReal = sueldo + extra;
  const ahorroMensual = Math.max(0, costoReal - PRECIO_FRONDIX);
  const ahorroAnual = ahorroMensual * 12;
  const anchoFrondix = costoReal > 0 ? Math.max(4, (PRECIO_FRONDIX / costoReal) * 100) : 4;

  return (
    <div className="tarjeta tarjeta-elevada calculadora-ahorro">
      <p className="suave pequeno" style={{ margin: "0 0 10px" }}>
        ¿Qué le pagarías hoy a alguien para que haga esto por ti? Marca lo que te aplica.
      </p>

      <div className="calculadora-tareas">
        {tareas.map((t) => (
          <div key={t.clave} className="calculadora-tarea-fila" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <input
              id={`tarea-${t.clave}`}
              type="checkbox"
              checked={t.activo}
              onChange={() => toggleTarea(t.clave)}
              style={{ width: "auto", flexShrink: 0 }}
            />
            <label htmlFor={`tarea-${t.clave}`} style={{ flex: 1, margin: 0, cursor: "pointer" }}>
              {t.etiqueta}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span className="suave pequeno">S/</span>
              <input
                type="number"
                min={0}
                step={50}
                inputMode="numeric"
                value={t.monto}
                disabled={!t.activo}
                onChange={(e) => cambiarMonto(t.clave, Number(e.target.value) || 0)}
                style={{ width: 90 }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="calculadora-beneficios">
        <p className="suave pequeno" style={{ margin: "0 0 6px" }}>
          Si lo contratas en planilla, de ley también pagas:
        </p>
        {BENEFICIOS.map((b) => (
          <div key={b.clave} className="calculadora-beneficio-fila">
            <span>{b.etiqueta} <span className="suave pequeno">— {b.nota}</span></span>
            <span style={{ fontWeight: 600 }}>+{soles(sueldo * b.pct)}</span>
          </div>
        ))}
        <div className="calculadora-beneficio-fila" style={{ borderTop: "1px solid var(--linea)", paddingTop: 8, marginTop: 4 }}>
          <span style={{ fontWeight: 700 }}>Costo real al mes</span>
          <span style={{ fontWeight: 700 }}>{soles(costoReal)}</span>
        </div>
      </div>

      <div className="calculadora-barras">
        <div className="calculadora-barra-fila">
          <span className="calculadora-barra-etiqueta">Contratar personal</span>
          <div className="calculadora-barra-pista">
            <div className="calculadora-barra calculadora-barra-roja" style={{ width: "100%" }} />
          </div>
          <span className="calculadora-barra-valor" style={{ color: "var(--error)" }}>{soles(costoReal)}/mes</span>
        </div>
        <div className="calculadora-barra-fila">
          <span className="calculadora-barra-etiqueta">Frondix</span>
          <div className="calculadora-barra-pista">
            <div className="calculadora-barra calculadora-barra-verde" style={{ width: `${anchoFrondix}%` }} />
          </div>
          <span className="calculadora-barra-valor" style={{ color: "var(--verde-700)" }}>{soles(PRECIO_FRONDIX)}/mes</span>
        </div>
      </div>

      <div className="calculadora-resultado">
        <p className="suave pequeno" style={{ margin: 0 }}>Te ahorras</p>
        <p className="calculadora-resultado-monto">
          {soles(ahorroMensual)}<span className="suave"> /mes</span>
        </p>
        <p className="suave pequeno" style={{ margin: "4px 0 0" }}>{soles(ahorroAnual)} al año</p>
      </div>

      <p className="suave pequeno" style={{ textAlign: "center", fontStyle: "italic" }}>
        Es como tener a alguien part-time ordenando tu negocio, sin el sueldo ni los beneficios de ley.
      </p>

      <p className="suave pequeno calculadora-nota-gratis">
        Y esto ya lo puedes hacer <strong>gratis</strong> en Frondix: cargar tu Excel, buscar y registrar. Pagar no es
        para empezar — es para cuando quieras subir de nivel la gestión de tu negocio (tu equipo trabajando junto,
        seguimiento automático de clientes, facturación electrónica).
      </p>
    </div>
  );
}
