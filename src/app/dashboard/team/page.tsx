"use client";

import { useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";

export default function TeamPage() {
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"admin" | "miembro">("miembro");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
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
    setMensaje(res.ok ? "Invitación enviada." : body.error);
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>Equipo</h1>
      <form onSubmit={invitar} style={{ display: "grid", gap: 12 }}>
        <input type="email" placeholder="Email a invitar" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <select value={rol} onChange={(e) => setRol(e.target.value as "admin" | "miembro")}>
          <option value="miembro">Miembro (carga y ve datos)</option>
          <option value="admin">Admin (además puede invitar)</option>
        </select>
        <button type="submit">Invitar</button>
        {mensaje && <p>{mensaje}</p>}
      </form>
    </main>
  );
}
