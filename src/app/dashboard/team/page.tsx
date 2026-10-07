"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";

const ETIQUETA_ROL: Record<string, string> = { dueno: "Dueño", admin: "Administrador", miembro: "Miembro" };

interface Miembro {
  userId: string;
  email: string;
  rol: string;
}

export default function TeamPage() {
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"admin" | "miembro">("miembro");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "aviso" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [miUserId, setMiUserId] = useState<string | null>(null);
  const [miRol, setMiRol] = useState<string | null>(null);
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null); // userId en el que hay una acción en curso

  async function cargarEquipo() {
    const supabase = crearClienteBrowser();
    const sesion = await empresaDelUsuario(supabase);
    if (!sesion.ok) return setErrorLista(sesion.error);
    setEmpresaId(sesion.empresaId);
    setMiRol(sesion.empresas.find((e) => e.empresaId === sesion.empresaId)?.rol ?? null);

    const { data: { user } } = await supabase.auth.getUser();
    setMiUserId(user?.id ?? null);

    const res = await fetch(`/api/team/miembros?empresaId=${sesion.empresaId}`);
    const body = await res.json();
    if (!res.ok) return setErrorLista(body.error ?? "No se pudo cargar el equipo");
    setMiembros(body.miembros);
  }

  useEffect(() => {
    cargarEquipo();
  }, []);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setEnviando(true);
    if (!empresaId) {
      setEnviando(false);
      return setMensaje({ tipo: "error", texto: "No se pudo identificar tu empresa." });
    }

    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, email, rol }),
    });
    const body = await res.json();
    setEnviando(false);
    if (res.ok) {
      setMensaje({ tipo: "ok", texto: "Invitación enviada." });
      setEmail("");
      cargarEquipo();
    } else {
      setMensaje({ tipo: res.status === 402 ? "aviso" : "error", texto: body.error });
    }
  }

  async function cambiarRol(userId: string, nuevoRol: string) {
    if (!empresaId) return;
    setOcupado(userId);
    const res = await fetch("/api/team/miembros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, userId, rol: nuevoRol }),
    });
    setOcupado(null);
    if (res.ok) setMiembros((ms) => (ms ?? []).map((m) => (m.userId === userId ? { ...m, rol: nuevoRol } : m)));
  }

  async function quitar(userId: string) {
    if (!empresaId) return;
    setOcupado(userId);
    const res = await fetch("/api/team/miembros", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, userId }),
    });
    if (!res.ok) return setOcupado(null);
    // Si te saliste a ti mismo, ya no tienes acceso a esta empresa -- navegación
    // dura para que el servidor vuelva a resolver a cuál otra (o ninguna) entrar.
    if (userId === miUserId) return (window.location.href = "/dashboard");
    setOcupado(null);
    setMiembros((ms) => (ms ?? []).filter((m) => m.userId !== userId));
  }

  const puedeGestionar = miRol === "dueno" || miRol === "admin";

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Equipo</h1>
          <p className="suave">Suma a quienes cargan datos contigo y elige qué puede hacer cada uno.</p>
        </div>
      </div>

      <form onSubmit={invitar} className="tarjeta" style={{ maxWidth: 520, marginBottom: 20 }}>
        <div className="campo">
          <label htmlFor="email-invitado">Email de la persona</label>
          <input id="email-invitado" type="email" placeholder="nombre@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="rol">Qué puede hacer</label>
          <select id="rol" value={rol} onChange={(e) => setRol(e.target.value as "admin" | "miembro")}>
            <option value="miembro">Miembro: carga y ve datos</option>
            <option value="admin">Admin: además puede invitar gente</option>
          </select>
        </div>

        {mensaje && (
          <p className={`alerta alerta-${mensaje.tipo}`} role="status">
            {mensaje.texto}{" "}
            {mensaje.tipo === "aviso" && <Link href="/dashboard/billing">Ver el plan</Link>}
          </p>
        )}

        <button type="submit" className="btn btn-primario" disabled={enviando}>
          {enviando ? "Enviando..." : "Enviar invitación"}
        </button>
      </form>

      <div className="tarjeta" style={{ maxWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Quiénes están</h3>
        {errorLista && <p className="alerta alerta-error" role="alert">{errorLista}</p>}
        {!errorLista && !miembros && <p className="suave pequeno">Cargando...</p>}
        {miembros?.map((m) => (
          <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--linea)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {m.email} {m.userId === miUserId && <span className="suave pequeno">(tú)</span>}
              </p>
            </div>
            {puedeGestionar && m.rol !== "dueno" ? (
              <select
                value={m.rol}
                onChange={(e) => cambiarRol(m.userId, e.target.value)}
                disabled={ocupado === m.userId}
                aria-label={`Rol de ${m.email}`}
              >
                <option value="miembro">Miembro</option>
                <option value="admin">Admin</option>
              </select>
            ) : (
              <span className="suave pequeno">{ETIQUETA_ROL[m.rol] ?? m.rol}</span>
            )}
            {m.rol !== "dueno" && (puedeGestionar || m.userId === miUserId) && (
              <button
                type="button"
                className="btn btn-fantasma"
                style={{ padding: "4px 10px" }}
                onClick={() => quitar(m.userId)}
                disabled={ocupado === m.userId}
              >
                {m.userId === miUserId ? "Salir" : "Quitar"}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
