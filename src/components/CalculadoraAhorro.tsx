"use client";

import { useState } from "react";

// Mismo precio que la sección de Precios (S/ 35/mes, plan Completo) -- si ese
// precio cambia, cambiarlo también acá.
const PRECIO_FRONDIX = 35;
const SUELDO_SUGERIDO = 1500; // referencia: asistente administrativo part-time en Lima, no RMV (ese es para jornada completa)

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
  const [sueldo, setSueldo] = useState(SUELDO_SUGERIDO);

  const extra = BENEFICIOS.reduce((suma, b) => suma + sueldo * b.pct, 0);
  const costoReal = sueldo + extra;
  const ahorroMensual = Math.max(0, costoReal - PRECIO_FRONDIX);
  const ahorroAnual = ahorroMensual * 12;
  const anchoFrondix = costoReal > 0 ? Math.max(4, (PRECIO_FRONDIX / costoReal) * 100) : 4;

  return (
    <div className="tarjeta tarjeta-elevada calculadora-ahorro">
      <div className="campo">
        <label htmlFor="sueldo-referencia">
          ¿Cuánto le pagarías al mes a alguien para cargar y ordenar tus ventas y compras?
        </label>
        <input
          id="sueldo-referencia"
          type="number"
          min={0}
          step={50}
          inputMode="numeric"
          value={sueldo}
          onChange={(e) => setSueldo(Math.max(0, Number(e.target.value) || 0))}
        />
        <p className="ayuda" style={{ marginTop: 4 }}>
          Referencia: un asistente part-time para esto suele cobrar desde S/ {SUELDO_SUGERIDO.toLocaleString("es-PE")}/mes.
        </p>
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

      <p className="suave pequeno calculadora-nota-gratis">
        Y esto ya lo puedes hacer <strong>gratis</strong> en Frondix: cargar tu Excel, buscar y registrar. Pagar no es
        para empezar — es para cuando quieras subir de nivel la gestión de tu negocio (tu equipo trabajando junto,
        seguimiento automático de clientes).
      </p>
    </div>
  );
}
