"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const supabase = crearClienteBrowser();

    const { error: errorSignup } = await supabase.auth.signUp({ email, password });
    if (errorSignup) {
      setEnviando(false);
      return setError(errorSignup.message);
    }

    // signUp ya deja la sesión activa si la confirmación de email está desactivada
    // (recomendado en desarrollo). En producción, el usuario confirma su email primero.
    const res = await fetch("/api/empresas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombreEmpresa }),
    });
    if (!res.ok) {
      const body = await res.json();
      setEnviando(false);
      return setError(body.error ?? "No se pudo crear la empresa");
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth">
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="auth-centro">
        <div className="tarjeta tarjeta-elevada auth-tarjeta">
          <h1>Crea tu cuenta</h1>
          <p className="suave">Gratis, sin tarjeta. En un minuto estás subiendo tu Excel.</p>
          <form onSubmit={onSubmit}>
            <div className="campo">
              <label htmlFor="negocio">Nombre de tu negocio</label>
              <input id="negocio" value={nombreEmpresa} onChange={(e) => setNombreEmpresa(e.target.value)} placeholder="Ej. Taller Los Andes" required />
            </div>
            <div className="campo">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="campo">
              <label htmlFor="password">Contraseña</label>
              <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              <p className="ayuda">Mínimo 6 caracteres.</p>
            </div>
            {error && <p className="alerta alerta-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primario btn-grande btn-bloque" disabled={enviando}>
              {enviando ? "Creando tu cuenta..." : "Crear cuenta"}
            </button>
          </form>
          <p className="centrado suave pequeno" style={{ marginTop: 20, marginBottom: 0 }}>
            ¿Ya tienes cuenta? <Link href="/login">Ingresar</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
