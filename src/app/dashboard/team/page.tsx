"use client";

import { useState } from "react";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";

export default function TeamPage() {
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"admin" | "miembro">("miembro");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "aviso" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    setEnviando(true);
    const supabase = crearClienteBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: miembro } = await supabase
      .from("miembros")
      .select("empresa_id")
      .eq("user_id", user!.id)
      .single();

    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId: miembro!.empresa_id, email, rol }),
    });
    const body = await res.json();
    setEnviando(false);
    if (res.ok) setMensaje({ tipo: "ok", texto: "Invitación enviada." });
    else setMensaje({ tipo: res.status === 402 ? "aviso" : "error", texto: body.error });
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Equipo</h1>
          <p className="suave">Sumá a quienes cargan datos con vos y elegí qué puede hacer cada uno.</p>
        </div>
      </div>

      <form onSubmit={invitar} className="tarjeta" style={{ maxWidth: 520 }}>
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
    </>
  );
}
