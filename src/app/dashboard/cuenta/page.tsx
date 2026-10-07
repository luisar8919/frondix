"use client";

import { useEffect, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";

const ETIQUETA_ROL: Record<string, string> = { dueno: "Dueño", admin: "Administrador", miembro: "Miembro" };

export default function CuentaPage() {
  const [cargando, setCargando] = useState(true);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<string | null>(null);
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [error, setError] = useState<string | null>(null);

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

      const actual = sesion.empresas.find((e) => e.empresaId === sesion.empresaId);
      setRol(actual?.rol ?? null);
      setNombreEmpresa(actual?.nombre ?? "");
      setCargando(false);
    })();
  }, []);

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

      <div className="tarjeta" style={{ maxWidth: 460 }}>
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
      </div>
    </>
  );
}
