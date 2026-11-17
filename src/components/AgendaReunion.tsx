"use client";

import { useState } from "react";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DOW = ["D", "L", "M", "M", "J", "V", "S"];
const HORARIOS = ["10:00", "11:30", "14:00", "16:00"];

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function isoDe(anio: number, mes: number, dia: number) {
  return `${anio}-${pad2(mes + 1)}-${pad2(dia)}`;
}
function normalizarMes(anio: number, mes: number) {
  while (mes < 0) { mes += 12; anio--; }
  while (mes > 11) { mes -= 12; anio++; }
  return { anio, mes };
}

// Calendario de 2 meses hacia adelante (este + el siguiente), dias pasados y
// fines de semana bloqueados. Al guardar, llama a /api/landing/agendar-reunion
// (ver ese archivo: guarda en reuniones_landing y avisa por correo al dueño).
export default function AgendaReunion() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [vista, setVista] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [fecha, setFecha] = useState<string | null>(null);
  const [horario, setHorario] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [rubro, setRubro] = useState("Comercio / retail");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<{ fecha: string; horario: string } | null>(null);

  const maxMes = normalizarMes(hoy.getFullYear(), hoy.getMonth() + 2);
  const puedeAtras = !(vista.anio === hoy.getFullYear() && vista.mes === hoy.getMonth());
  const puedeAdelante = !(vista.anio === maxMes.anio && vista.mes === maxMes.mes);

  function irMes(delta: number) {
    setVista((v) => normalizarMes(v.anio, v.mes + delta));
  }

  const primerDow = new Date(vista.anio, vista.mes, 1).getDay();
  const diasEnMes = new Date(vista.anio, vista.mes + 1, 0).getDate();
  const celdas: (number | null)[] = [
    ...Array(primerDow).fill(null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ];

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError("Ingresa un correo valido, es el unico dato obligatorio ademas del nombre.");
      return;
    }
    if (!fecha || !horario) {
      setError("Elige un dia y un horario del calendario.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/landing/agendar-reunion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, correo, rubro, mensaje, fecha, horario }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo guardar la reserva");
      }
      setListo({ fecha, horario });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la reserva, intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (listo) {
    const d = new Date(`${listo.fecha}T00:00:00`);
    const texto = d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
    return (
      <p className="alerta alerta-ok" style={{ margin: 0 }}>
        ¡Listo{nombre ? `, ${nombre}` : ""}! Tu reunión quedó agendada para <b>{texto}, {listo.horario}</b>. Te vamos a confirmar a <code>{correo}</code>.
      </p>
    );
  }

  return (
    <div className="agenda-grilla">
      <div>
        <div className="tarjeta agenda-calendario">
          <div className="agenda-calendario-cabecera">
            <button type="button" onClick={() => irMes(-1)} disabled={!puedeAtras} aria-label="Mes anterior">‹</button>
            <b style={{ textTransform: "capitalize" }}>{MESES[vista.mes]} {vista.anio}</b>
            <button type="button" onClick={() => irMes(1)} disabled={!puedeAdelante} aria-label="Mes siguiente">›</button>
          </div>
          <div className="agenda-calendario-grilla">
            {DOW.map((d, i) => (
              <div key={i} className="agenda-dow">{d}</div>
            ))}
            {celdas.map((dia, i) => {
              if (dia === null) return <div key={`vacio-${i}`} />;
              const iso = isoDe(vista.anio, vista.mes, dia);
              const celda = new Date(vista.anio, vista.mes, dia);
              celda.setHours(0, 0, 0, 0);
              const esPasado = celda < hoy;
              const diaSemana = celda.getDay();
              const esFinde = diaSemana === 0 || diaSemana === 6;
              const esHoy = celda.getTime() === hoy.getTime();
              return (
                <button
                  key={iso}
                  type="button"
                  className={`agenda-dia${esHoy ? " agenda-dia-hoy" : ""}`}
                  disabled={esPasado || esFinde}
                  aria-pressed={iso === fecha}
                  onClick={() => { setFecha(iso); setHorario(null); }}
                >
                  {dia}
                </button>
              );
            })}
          </div>
        </div>

        {fecha && (
          <div style={{ marginTop: 12 }}>
            <p className="ayuda" style={{ marginBottom: 8 }}>
              Horarios para {new Date(`${fecha}T00:00:00`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}:
            </p>
            <div className="agenda-horarios-grilla">
              {HORARIOS.map((h) => (
                <button key={h} type="button" className="agenda-horario" aria-pressed={h === horario} onClick={() => setHorario(h)}>
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={enviar}>
        <div className="campo">
          <label htmlFor="agendaNombre">Nombre</label>
          <input id="agendaNombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" />
        </div>
        <div className="campo">
          <label htmlFor="agendaCorreo">Correo <span style={{ color: "var(--error)" }}>(obligatorio)</span></label>
          <input id="agendaCorreo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tucorreo@negocio.com" required />
        </div>
        <div className="campo">
          <label htmlFor="agendaRubro">Tipo de negocio</label>
          <select id="agendaRubro" value={rubro} onChange={(e) => setRubro(e.target.value)}>
            <option>Comercio / retail</option>
            <option>Gastronomía</option>
            <option>Servicios con cita</option>
            <option>Membresías o alquileres</option>
            <option>Construcción / proyectos</option>
            <option>Otro</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="agendaMensaje">¿Algo que quieras contarnos antes? (opcional)</label>
          <textarea id="agendaMensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej: hoy llevo todo en Excel, uso 3 hojas distintas..." rows={3} />
        </div>
        {error && <p className="alerta alerta-error">{error}</p>}
        <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
          {enviando ? "Guardando..." : "Solicitar reunión"}
        </button>
      </form>
    </div>
  );
}
