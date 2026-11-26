"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";
import { CANALES_AVISO, type Regla } from "@/lib/reglas";
import { enviosWhatsappEsteMes } from "@/lib/whatsappMetricas";

interface ModuloConReglas {
  datasetId: string;
  nombre: string;
  reglas: Regla[];
}

interface MensajeEntrante {
  id: string;
  telefono: string;
  mensaje: string | null;
  recibido_en: string;
}

// Vista de solo-consulta de los 4 canales de notificación de la plataforma
// (Push/Correo/Telegram/WhatsApp) -- NO reimplementa edición (eso sigue en
// Condicionales, por regla, y en Mi empresa, para Telegram/el teléfono de
// WhatsApp): acá se junta todo en un solo lugar para entender de un vistazo
// qué manda qué y por dónde, cosa que antes estaba repartido en 3 pantallas
// sin relación visible entre sí.
export default function NotificacionesPage() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [telefono, setTelefono] = useState<string | null>(null);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [modulos, setModulos] = useState<ModuloConReglas[]>([]);
  const [whatsappEsteMes, setWhatsappEsteMes] = useState<number | null>(null);
  const [mensajesEntrantes, setMensajesEntrantes] = useState<MensajeEntrante[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = crearClienteBrowser();
      const sesion = await empresaDelUsuario(supabase);
      if (!sesion.ok) {
        setError(sesion.error);
        return setCargando(false);
      }
      const { data: empresa } = await supabase
        .from("empresas")
        .select("telefono, telegram_chat_id")
        .eq("id", sesion.empresaId)
        .single();
      setTelefono(empresa?.telefono ?? null);
      setTelegramChatId(empresa?.telegram_chat_id ?? null);
      setWhatsappEsteMes(await enviosWhatsappEsteMes(supabase, sesion.empresaId));

      const { data: entrantes } = await supabase
        .from("whatsapp_mensajes_entrantes")
        .select("id, telefono, mensaje, recibido_en")
        .eq("empresa_id", sesion.empresaId)
        .order("recibido_en", { ascending: false })
        .limit(10);
      setMensajesEntrantes(entrantes ?? []);

      const res = await fetch("/api/reglas");
      const body = await res.json();
      if (res.ok) setModulos(body.modulos ?? []);
      setCargando(false);
    })();
  }, []);

  // Solo las reglas de aviso al dueño (notificacion_push) tienen canales
  // elegibles -- el resto de acciones de Condicionales no son "notificaciones".
  const avisosPersonalizados = modulos
    .map((m) => ({
      ...m,
      avisos: m.reglas.filter((r): r is Regla & { accion: Extract<Regla["accion"], { tipo: "notificacion_push" }> } => r.accion.tipo === "notificacion_push"),
    }))
    .filter((m) => m.avisos.length > 0);

  if (cargando) return <p className="suave">Cargando...</p>;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Notificaciones</h1>
          <p className="suave">
            Qué te avisa Frondix, por dónde, y por qué el WhatsApp es el canal más limitado de los 4.
          </p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}

      <div className="tarjeta" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Avisos automáticos del sistema</h3>
        <p className="suave pequeno">Corren solos, sin que armes nada -- mismos 2 para todas las empresas.</p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--linea)" }}>
              <th style={{ padding: "6px 8px 6px 0" }}>Aviso</th>
              <th style={{ padding: "6px 8px" }}>Frecuencia</th>
              <th style={{ padding: "6px 8px" }}>Canales</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid var(--linea)" }}>
              <td style={{ padding: "8px 8px 8px 0" }}>Clientes inactivos (Seguimiento)</td>
              <td style={{ padding: "8px" }} className="suave pequeno">cada 6 horas</td>
              <td style={{ padding: "8px" }}>
                <span className="insignia">App</span> <span className="insignia">WhatsApp</span> <span className="insignia">Telegram</span>
              </td>
            </tr>
            <tr>
              <td style={{ padding: "8px 8px 8px 0" }}>Vencimientos próximos</td>
              <td style={{ padding: "8px" }} className="suave pequeno">diario</td>
              <td style={{ padding: "8px" }}>
                <span className="insignia">App</span> <span className="insignia">Correo</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="suave pequeno" style={{ marginTop: 10 }}>
          Vencimientos no manda WhatsApp a propósito -- cada mensaje de WhatsApp tiene costo, y ya queda cubierto con
          App + Correo.
        </p>
      </div>

      <div className="tarjeta" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Avisos personalizados (Condicionales)</h3>
        <p className="suave pequeno">
          Los armás vos por módulo en "Condicionales" -- acá solo se listan, con sus canales. WhatsApp nunca es una
          opción en estos: su mensaje es texto libre que escribís cada vez, y WhatsApp solo admite plantillas de
          estructura fija ya aprobadas por Meta.
        </p>
        {avisosPersonalizados.length === 0 && (
          <p className="suave pequeno" style={{ marginTop: 10 }}>
            Todavía no armaste ningún aviso personalizado. Se agregan desde{" "}
            <Link href="/dashboard/reglas">Condicionales</Link>, acción "Notificación push".
          </p>
        )}
        {avisosPersonalizados.map((m) => (
          <div key={m.datasetId} style={{ marginTop: 14 }}>
            <p className="pequeno" style={{ margin: "0 0 6px", fontWeight: 600 }}>{m.nombre}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {m.avisos.map((r, i) => {
                const canales = r.accion.canales?.length ? r.accion.canales : ["push" as const];
                return (
                  <li key={r.id ?? i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: i > 0 ? "1px solid var(--linea)" : "none" }}>
                    <span className="pequeno" style={{ flex: 1, minWidth: 140 }}>{r.accion.titulo || "(sin título)"}</span>
                    {CANALES_AVISO.filter((c) => canales.includes(c.valor)).map((c) => (
                      <span key={c.valor} className="insignia">{c.etiqueta}</span>
                    ))}
                  </li>
                );
              })}
            </ul>
            <Link href="/dashboard/reglas" className="suave pequeno">Editar en Condicionales &rarr;</Link>
          </div>
        ))}
      </div>

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Estado de tus canales</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li style={{ padding: "8px 0", borderBottom: "1px solid var(--linea)" }}>
            <strong>App (push)</strong> -- <span className="suave pequeno">activo para todos los miembros con la app instalada, no requiere configuración.</span>
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid var(--linea)" }}>
            <strong>Correo</strong> -- <span className="suave pequeno">activo, va a tu email de cuenta (los avisos a clientes finales usan tu SMTP propio si lo configuraste en Mi empresa).</span>
          </li>
          <li style={{ padding: "8px 0", borderBottom: "1px solid var(--linea)" }}>
            <strong>WhatsApp</strong> --{" "}
            {telefono ? (
              <span className="suave pequeno">
                conectado al {telefono}.{" "}
                {whatsappEsteMes !== null && (
                  <strong>
                    {whatsappEsteMes} {whatsappEsteMes === 1 ? "mensaje enviado" : "mensajes enviados"} este mes
                  </strong>
                )}{" "}
                -- el único canal con costo real por mensaje.
              </span>
            ) : (
              <span className="suave pequeno">
                sin número cargado -- no vas a recibir nada por acá hasta que lo cargues en{" "}
                <Link href="/dashboard/empresa">Mi empresa</Link>.
              </span>
            )}
          </li>
          <li style={{ padding: "8px 0" }}>
            <strong>Telegram</strong> --{" "}
            {telegramChatId ? (
              <span className="suave pequeno">conectado.</span>
            ) : (
              <span className="suave pequeno">
                sin conectar -- es gratis y podés activarlo en <Link href="/dashboard/empresa">Mi empresa</Link>.
              </span>
            )}
          </li>
        </ul>
      </div>

      {mensajesEntrantes.length > 0 && (
        <div className="tarjeta" style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>Mensajes recibidos por WhatsApp</h3>
          <p className="suave pequeno">
            Respuestas tuyas al número compartido de la plataforma (nunca de un cliente final, ver más arriba).
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {mensajesEntrantes.map((m, i) => (
              <li key={m.id} style={{ padding: "8px 0", borderTop: i > 0 ? "1px solid var(--linea)" : "none" }}>
                <span className="suave pequeno">{new Date(m.recibido_en).toLocaleString("es-PE")}</span>
                <p style={{ margin: "2px 0 0" }}>{m.mensaje ?? "(sin texto)"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
