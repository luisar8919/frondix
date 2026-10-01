"use client";

import { useEffect, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario } from "@/lib/sesion";

const ETIQUETA_ROL: Record<string, string> = { dueno: "Dueño", admin: "Administrador", miembro: "Miembro" };

export default function CuentaPage() {
  const [cargando, setCargando] = useState(true);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = crearClienteBrowser();
      const sesion = await empresaDelUsuario(supabase);
      if (!sesion.ok) {
        setMensaje({ tipo: "error", texto: sesion.error });
        return setCargando(false);
      }
      setEmpresaId(sesion.empresaId);

      const { data: { user } } = await supabase.auth.getUser();
      setEmail(user?.email ?? "");

      const { data: miembro } = await supabase
        .from("miembros")
        .select("rol")
        .eq("empresa_id", sesion.empresaId)
        .eq("user_id", user?.id)
        .single();
      if (miembro) setRol(miembro.rol);

      const { data: empresa } = await supabase
        .from("empresas")
        .select("nombre, telefono")
        .eq("id", sesion.empresaId)
        .single();
      if (empresa) {
        setNombre(empresa.nombre ?? "");
        setTelefono(empresa.telefono ?? "");
      }
      setCargando(false);
    })();
  }, []);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId) return;
    setGuardando(true);
    setMensaje(null);
    const res = await fetch("/api/empresas/actualizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, nombre, telefono }),
    });
    const body = await res.json();
    setGuardando(false);
    setMensaje(res.ok ? { tipo: "ok", texto: "Guardado." } : { tipo: "error", texto: body.error ?? "No se pudo guardar" });
  }

  if (cargando) return null;

  const puedeEditar = rol === "dueno" || rol === "admin";

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Mi cuenta</h1>
          <p className="suave">Datos de tu negocio. El email es el único dato que no puedes cambiar aquí.</p>
        </div>
      </div>

      <form onSubmit={guardar} className="tarjeta" style={{ maxWidth: 460 }}>
        <div className="campo">
          <label htmlFor="email-cuenta">Email</label>
          <input id="email-cuenta" value={email} disabled />
        </div>
        <div className="campo">
          <label htmlFor="rol-cuenta">Tu rol en la empresa</label>
          <input id="rol-cuenta" value={rol ? ETIQUETA_ROL[rol] ?? rol : ""} disabled />
        </div>
        <div className="campo">
          <label htmlFor="nombre-cuenta">Nombre de tu negocio</label>
          <input id="nombre-cuenta" value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={!puedeEditar} />
        </div>
        <div className="campo">
          <label htmlFor="telefono-cuenta">WhatsApp del negocio</label>
          <input
            id="telefono-cuenta"
            type="tel"
            inputMode="numeric"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))}
            required
            disabled={!puedeEditar}
          />
          <p className="ayuda">9 dígitos, sin +51.</p>
        </div>

        {!puedeEditar && <p className="suave pequeno">Solo el dueño o un administrador puede editar estos datos.</p>}
        {mensaje && <p className={`alerta alerta-${mensaje.tipo}`} role="status">{mensaje.texto}</p>}

        {puedeEditar && (
          <button type="submit" className="btn btn-primario" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        )}
      </form>
    </>
  );
}
