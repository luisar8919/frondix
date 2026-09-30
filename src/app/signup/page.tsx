"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [correoEnviado, setCorreoEnviado] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!aceptaTerminos) return setError("Debes aceptar los Términos de Servicio para crear tu cuenta.");
    setEnviando(true);
    const supabase = crearClienteBrowser();

    const { data, error: errorSignup } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setEnviando(false);
    if (errorSignup) return setError(errorSignup.message);

    // Con "Confirm email" activado en Supabase (recomendado), signUp no deja
    // sesión activa todavía: hay que esperar a que confirme por correo. El
    // nombre del negocio y el teléfono se piden después, en /auth/completar,
    // el mismo paso por el que ya pasa el login con Google.
    if (!data.session) return setCorreoEnviado(true);
    router.push("/auth/completar");
    router.refresh();
  }

  async function conGoogle() {
    setError(null);
    if (!aceptaTerminos) return setError("Debes aceptar los Términos de Servicio para crear tu cuenta.");
    const supabase = crearClienteBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="auth">
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="auth-centro">
        <div className="tarjeta tarjeta-elevada auth-tarjeta">
          {correoEnviado ? (
            <>
              <h1>Revisa tu correo</h1>
              <p className="suave">
                Te mandamos un enlace a <strong>{email}</strong> para confirmar tu cuenta. Ábrelo desde el mismo
                celular o computadora donde quieres usar Frondix.
              </p>
            </>
          ) : (
            <>
              <h1>Crea tu cuenta</h1>
              <p className="suave">Gratis, sin tarjeta. En un minuto estás subiendo tu Excel.</p>
              <form onSubmit={onSubmit}>
                <div className="campo">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="campo">
                  <label htmlFor="password">Contraseña</label>
                  <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                  <p className="ayuda">Mínimo 6 caracteres.</p>
                </div>
                <div className="campo campo-check">
                  <label>
                    <input type="checkbox" checked={aceptaTerminos} onChange={(e) => setAceptaTerminos(e.target.checked)} />{" "}
                    He leído y acepto los <Link href="/terminos" target="_blank">Términos de Servicio</Link>, incluyendo que soy responsable de los datos que subo.
                  </label>
                </div>
                {error && <p className="alerta alerta-error" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primario btn-grande btn-bloque" disabled={enviando}>
                  {enviando ? "Creando tu cuenta..." : "Crear cuenta"}
                </button>
              </form>
              <div className="separador-o"><span>o</span></div>
              <button type="button" className="btn btn-secundario btn-grande btn-bloque" onClick={conGoogle}>
                Continuar con Google
              </button>
              <p className="centrado suave pequeno" style={{ marginTop: 20, marginBottom: 0 }}>
                ¿Ya tienes cuenta? <Link href="/login">Ingresar</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
