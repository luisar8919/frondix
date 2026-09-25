"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = crearClienteBrowser();

    const { error: errorSignup } = await supabase.auth.signUp({ email, password });
    if (errorSignup) return setError(errorSignup.message);

    // signUp ya deja la sesión activa si la confirmación de email está desactivada
    // (recomendado en desarrollo). En producción, el usuario confirma su email primero.
    const res = await fetch("/api/empresas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombreEmpresa }),
    });
    if (!res.ok) {
      const body = await res.json();
      return setError(body.error ?? "No se pudo crear la empresa");
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto" }}>
      <h1>Crear cuenta</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <input placeholder="Nombre de tu negocio" value={nombreEmpresa} onChange={(e) => setNombreEmpresa(e.target.value)} required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit">Crear cuenta</button>
      </form>
    </main>
  );
}
