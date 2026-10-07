"use client";

import { useState } from "react";
import Link from "next/link";
import { crearClienteBrowser } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

// Manda el correo de "recuperar contraseña" (tipo "recovery" de Supabase). El
// enlace pasa por /auth/confirm -> /auth/confirmar (clic humano, ver esos
// archivos) -> /auth/completar, que pide la contraseña nueva igual que a un
// invitado (nunca la escribió recién, llegó con un enlace).
export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const supabase = crearClienteBrowser();
    const { error: errorReset } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });
    setEnviando(false);
    // Nunca se revela si el correo existe o no (evita que alguien use esto para
    // adivinar cuentas): siempre se muestra el mismo mensaje de éxito, salvo un
    // error real de red/servidor.
    if (errorReset && errorReset.status && errorReset.status >= 500) {
      return setError("No se pudo enviar el correo. Intenta de nuevo en un momento.");
    }
    setEnviado(true);
  }

  return (
    <div className="auth">
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="auth-centro">
        <div className="tarjeta tarjeta-elevada auth-tarjeta">
          {enviado ? (
            <>
              <h1>Revisa tu correo</h1>
              <p className="suave">
                Si <strong>{email}</strong> tiene una cuenta en Frondix, te mandamos un enlace para poner una
                contraseña nueva.
              </p>
            </>
          ) : (
            <>
              <h1>Recuperar tu contraseña</h1>
              <p className="suave">Te mandamos un enlace para que pongas una contraseña nueva.</p>
              <form onSubmit={onSubmit}>
                <div className="campo">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </div>
                {error && <p className="alerta alerta-error" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primario btn-grande btn-bloque" disabled={enviando}>
                  {enviando ? "Enviando..." : "Mandar enlace"}
                </button>
              </form>
            </>
          )}
          <p className="centrado suave pequeno" style={{ marginTop: 20, marginBottom: 0 }}>
            <Link href="/login">Volver a ingresar</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
