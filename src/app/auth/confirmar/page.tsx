"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { crearClienteBrowser } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

// useSearchParams exige un límite de Suspense alrededor (requisito de Next.js).
export default function ConfirmarPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmarForm />
    </Suspense>
  );
}

const TEXTOS: Record<string, { titulo: string; boton: string }> = {
  invite: { titulo: "Te invitaron a un equipo en Frondix", boton: "Aceptar invitación" },
  signup: { titulo: "Confirma tu correo", boton: "Confirmar mi correo" },
  recovery: { titulo: "Recuperar tu contraseña", boton: "Continuar" },
  magiclink: { titulo: "Ingresar a Frondix", boton: "Continuar" },
};

// La verificación del enlace pasa acá (nunca en el GET de /auth/confirm, ver ese
// archivo): recién cuando la persona hace clic en el botón se gasta el token de
// un solo uso, así un escaneo automático del correo (Outlook, antivirus) que
// abre el enlace antes no lo deja inválido para cuando el humano lo abre de verdad.
function ConfirmarForm() {
  const params = useSearchParams();
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const textos = TEXTOS[type ?? ""] ?? { titulo: "Confirmar", boton: "Continuar" };

  async function confirmar() {
    if (!tokenHash || !type) return;
    setCargando(true);
    setError(null);
    const supabase = crearClienteBrowser();
    const { error: errorOtp } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (errorOtp) {
      setCargando(false);
      setError(
        "Este enlace ya no es válido: puede que ya se haya usado, o que tu correo lo haya abierto antes por seguridad. Pide que te lo manden de nuevo."
      );
      return;
    }
    window.location.href = type === "invite" ? "/auth/completar?type=invite" : "/auth/completar";
  }

  return (
    <div className="auth">
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="auth-centro">
        <div className="tarjeta tarjeta-elevada auth-tarjeta">
          {!tokenHash || !type ? (
            <>
              <h1>Enlace inválido</h1>
              <p className="suave">Este enlace está incompleto. Pide que te lo vuelvan a mandar.</p>
            </>
          ) : (
            <>
              <h1>{textos.titulo}</h1>
              <p className="suave">Confírmalo con un clic.</p>
              {error && <p className="alerta alerta-error" role="alert">{error}</p>}
              <button type="button" className="btn btn-primario btn-grande btn-bloque" onClick={confirmar} disabled={cargando}>
                {cargando ? "Confirmando..." : textos.boton}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
