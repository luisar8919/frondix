"use client";

import { useEffect, useState } from "react";

interface LogroEstado {
  clave: string;
  titulo: string;
  descripcion: string;
  pago: boolean;
  logrado: boolean;
  logradoEn: string | null;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });

// Checklist de hitos del negocio ("primera venta", "primer módulo"...) para
// Inicio: empuja a probar cada rincón de la app, no es un logro de videojuego
// -- sin confeti ni sonidos, solo un check con la fecha real en que se logró.
// Ver src/lib/logros.ts para el catálogo y cómo se detecta cada uno.
export default function Logros() {
  const [logros, setLogros] = useState<LogroEstado[] | null>(null);
  const [pagado, setPagado] = useState(false);

  useEffect(() => {
    fetch("/api/logros")
      .then((res) => res.json())
      .then((body) => {
        if (body.logros) { setLogros(body.logros); setPagado(!!body.pagado); }
      })
      .catch(() => setLogros([]));
  }, []);

  if (!logros || logros.length === 0) return null;

  const gratis = logros.filter((l) => !l.pago);
  const pago = logros.filter((l) => l.pago);
  const logradosGratis = gratis.filter((l) => l.logrado).length;
  const logradosPago = pago.filter((l) => l.logrado).length;
  // Siguiente paso sugerido: el primer hito sin marcar, en el orden del
  // catálogo (ver LOGROS en src/lib/logros.ts) -- empuja a probar el próximo
  // rincón de la app en vez de dejar que el usuario adivine por dónde seguir.
  const siguiente = logros.find((l) => !l.logrado && !(l.pago && !pagado));

  const Fila = ({ l }: { l: LogroEstado }) => {
    const bloqueado = l.pago && !pagado;
    return (
      <li
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          padding: "8px 0",
          borderBottom: "1px solid var(--linea)",
          opacity: bloqueado && !l.logrado ? 0.55 : 1,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            flex: "0 0 auto",
            width: 20,
            height: 20,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            marginTop: 1,
            background: l.logrado ? "var(--verde-600)" : "transparent",
            border: l.logrado ? "none" : "1.5px solid var(--linea-fuerte)",
            color: "#fff",
          }}
        >
          {l.logrado ? "✓" : ""}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>{l.titulo}</strong>
          <p className="suave pequeno" style={{ margin: "2px 0 0" }}>
            {l.logrado && l.logradoEn ? `Logrado el ${fecha(l.logradoEn)}` : l.descripcion}
          </p>
        </div>
        {bloqueado && !l.logrado && <span className="insignia insignia-sol" style={{ flex: "0 0 auto" }}>Plan pago</span>}
      </li>
    );
  };

  return (
    <div className="tarjeta" style={{ marginBottom: 20, padding: 20 }}>
      {siguiente && (
        <p className="alerta alerta-aviso" style={{ marginTop: 0, marginBottom: 18 }}>
          Siguiente paso sugerido: <strong>{siguiente.titulo}</strong> — {siguiente.descripcion}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Plan gratis</h3>
        <span className="suave pequeno">{logradosGratis} de {gratis.length}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {gratis.map((l) => <Fila key={l.clave} l={l} />)}
      </ul>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "18px 0 4px" }}>
        <h3 style={{ margin: 0 }}>Del plan pago</h3>
        <span className="suave pequeno">{logradosPago} de {pago.length}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {pago.map((l) => <Fila key={l.clave} l={l} />)}
      </ul>
    </div>
  );
}
