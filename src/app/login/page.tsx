"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const supabase = crearClienteBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setEnviando(false);
      return setError("El email o la contraseña no son correctos.");
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
          <h1>Ingresar</h1>
          <p className="suave">Volvé a tu panel para seguir cultivando tu cartera.</p>
          <form onSubmit={onSubmit}>
            <div className="campo">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="campo">
              <label htmlFor="password">Contraseña</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="alerta alerta-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primario btn-grande btn-bloque" disabled={enviando}>
              {enviando ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
          <p className="centrado suave pequeno" style={{ marginTop: 20, marginBottom: 0 }}>
            ¿Todavía no tenés cuenta? <Link href="/signup">Crear cuenta gratis</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
