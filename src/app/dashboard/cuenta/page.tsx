"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";

const ETIQUETA_ROL: Record<string, string> = { dueno: "Dueño", admin: "Administrador", miembro: "Miembro" };

export default function CuentaPage() {
  const [cargando, setCargando] = useState(true);
  const [email, setEmail] = useState("");
  const [ultimoIngreso, setUltimoIngreso] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [passwordConfirmar, setPasswordConfirmar] = useState("");
  const [mensajePassword, setMensajePassword] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [emailConfirmacion, setEmailConfirmacion] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = crearClienteBrowser();
      const sesion = await empresaDelUsuario(supabase);
      if (!sesion.ok) {
        setError(sesion.error);
        return setCargando(false);
      }

      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");
      setUltimoIngreso(user?.last_sign_in_at ?? null);

      const actual = sesion.empresas.find((e) => e.empresaId === sesion.empresaId);
      setRol(actual?.rol ?? null);
      setNombreEmpresa(actual?.nombre ?? "");
      setCargando(false);
    })();
  }, []);

  async function cambiarPassword(e: React.FormEvent) {
    e.preventDefault();
    setMensajePassword(null);
    if (password !== passwordConfirmar) {
      return setMensajePassword({ tipo: "error", texto: "Las contraseñas no coinciden." });
    }
    setGuardandoPassword(true);
    const { error: errorPass } = await crearClienteBrowser().auth.updateUser({ password });
    setGuardandoPassword(false);
    if (errorPass) return setMensajePassword({ tipo: "error", texto: errorPass.message });
    setPassword("");
    setPasswordConfirmar("");
    setMensajePassword({ tipo: "ok", texto: "Contraseña actualizada." });
  }

  async function eliminarCuenta() {
    setErrorBorrado(null);
    setBorrando(true);
    const res = await fetch("/api/cuenta/eliminar", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBorrando(false);
      return setErrorBorrado(body.error ?? "No se pudo eliminar la cuenta");
    }
    await crearClienteBrowser().auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (cargando) return null;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Mis datos</h1>
          <p className="suave">Tu acceso a Frondix. El nombre y teléfono del negocio están en &quot;Mi empresa&quot;.</p>
        </div>
      </div>

      {error && <p className="alerta alerta-error" role="alert">{error}</p>}

      <div className="tarjeta" style={{ maxWidth: 460, marginBottom: 20 }}>
        <div className="campo">
          <label htmlFor="email-cuenta">Email</label>
          <input id="email-cuenta" value={email} disabled />
        </div>
        <div className="campo">
          <label htmlFor="empresa-cuenta">Empresa que estás gestionando</label>
          <input id="empresa-cuenta" value={nombreEmpresa} disabled />
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="rol-cuenta">Tu rol ahí</label>
          <input id="rol-cuenta" value={rol ? ETIQUETA_ROL[rol] ?? rol : ""} disabled />
        </div>
        {ultimoIngreso && (
          <p className="suave pequeno" style={{ margin: "14px 0 0" }}>
            Último ingreso: {new Date(ultimoIngreso).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}.
            Si no fuiste tú, cambia tu contraseña abajo.
          </p>
        )}
      </div>

      <form onSubmit={cambiarPassword} className="tarjeta" style={{ maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>Cambiar contraseña</h3>
        <div className="campo">
          <label htmlFor="password-nueva">Nueva contraseña</label>
          <input
            id="password-nueva"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label htmlFor="password-confirmar">Repetirla</label>
          <input
            id="password-confirmar"
            type="password"
            autoComplete="new-password"
            value={passwordConfirmar}
            onChange={(e) => setPasswordConfirmar(e.target.value)}
            required
            minLength={6}
          />
          <p className="ayuda">Mínimo 6 caracteres.</p>
        </div>

        {mensajePassword && <p className={`alerta alerta-${mensajePassword.tipo}`} role="status" style={{ marginTop: 14 }}>{mensajePassword.texto}</p>}

        <button type="submit" className="btn btn-primario" style={{ marginTop: 14 }} disabled={guardandoPassword}>
          {guardandoPassword ? "Guardando..." : "Cambiar contraseña"}
        </button>
      </form>

      <div className="tarjeta" style={{ maxWidth: 460, marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Eliminar cuenta</h3>
        {!confirmandoBorrado ? (
          <>
            <p className="suave pequeno" style={{ margin: "0 0 14px" }}>
              Borra tu acceso a Frondix. Si eres dueño único de una empresa, se borra toda su información (no se
              puede deshacer). Si eres dueño junto con más gente en el equipo, primero tienes que quitarlos.
            </p>
            <button type="button" className="btn btn-secundario" onClick={() => setConfirmandoBorrado(true)}>
              Eliminar mi cuenta
            </button>
          </>
        ) : (
          <div className="alerta alerta-aviso" style={{ marginBottom: 0 }}>
            <p style={{ marginTop: 0 }}>
              Esto no se puede deshacer. Para confirmar, escribe tu email (<strong>{email}</strong>) abajo.
            </p>
            <input
              value={emailConfirmacion}
              onChange={(e) => setEmailConfirmacion(e.target.value)}
              placeholder={email}
              style={{ marginBottom: 10 }}
            />
            {errorBorrado && <p className="alerta alerta-error" role="alert">{errorBorrado}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn btn-primario"
                onClick={eliminarCuenta}
                disabled={borrando || emailConfirmacion.trim().toLowerCase() !== email.toLowerCase()}
              >
                {borrando ? "Eliminando..." : "Sí, eliminar mi cuenta"}
              </button>
              <button type="button" className="btn btn-fantasma" onClick={() => { setConfirmandoBorrado(false); setEmailConfirmacion(""); setErrorBorrado(null); }} disabled={borrando}>
                Mejor no
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
