"use client";

import { useEffect, useState } from "react";
import { crearClienteBrowser } from "@/lib/supabase/client";
import { empresaDelUsuario, elegirEmpresaActiva, type EmpresaDeUsuario } from "@/lib/sesion";
import { limitesDelUsuario, type LimitesEmpresas } from "@/lib/limites";

export default function EmpresaPage() {
  const [cargando, setCargando] = useState(true);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaDeUsuario[]>([]);
  const [rol, setRol] = useState<string | null>(null);
  const [limites, setLimites] = useState<LimitesEmpresas | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [creando, setCreando] = useState(false);
  const [nombreNueva, setNombreNueva] = useState("");
  const [telefonoNueva, setTelefonoNueva] = useState("");
  const [errorNueva, setErrorNueva] = useState<string | null>(null);
  const [enviandoNueva, setEnviandoNueva] = useState(false);

  const [otrosMiembros, setOtrosMiembros] = useState<{ userId: string; email: string; rol: string }[]>([]);
  const [destinoTransferir, setDestinoTransferir] = useState("");
  const [mensajeTransferir, setMensajeTransferir] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [transfiriendo, setTransfiriendo] = useState(false);

  const [confirmarNombre, setConfirmarNombre] = useState("");
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function cargar() {
    const supabase = crearClienteBrowser();
    const sesion = await empresaDelUsuario(supabase);
    if (!sesion.ok) {
      setMensaje({ tipo: "error", texto: sesion.error });
      return setCargando(false);
    }
    setEmpresaId(sesion.empresaId);
    setEmpresas(sesion.empresas);
    setRol(sesion.empresas.find((e) => e.empresaId === sesion.empresaId)?.rol ?? null);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) setLimites(await limitesDelUsuario(supabase, user.id));

    const { data: empresa } = await supabase.from("empresas").select("nombre, telefono").eq("id", sesion.empresaId).single();
    if (empresa) {
      setNombre(empresa.nombre ?? "");
      setTelefono(empresa.telefono ?? "");
    }

    const miRolActual = sesion.empresas.find((e) => e.empresaId === sesion.empresaId)?.rol;
    if (miRolActual === "dueno") {
      const resMiembros = await fetch(`/api/team/miembros?empresaId=${sesion.empresaId}`);
      const bodyMiembros = await resMiembros.json();
      if (resMiembros.ok) setOtrosMiembros(bodyMiembros.miembros.filter((m: { rol: string }) => m.rol !== "dueno"));
    }

    setCargando(false);
  }

  useEffect(() => {
    cargar();
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

  async function crearEmpresa(e: React.FormEvent) {
    e.preventDefault();
    setErrorNueva(null);
    setEnviandoNueva(true);
    const res = await fetch("/api/empresas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombreEmpresa: nombreNueva, telefono: telefonoNueva }),
    });
    const body = await res.json();
    setEnviandoNueva(false);
    if (!res.ok) return setErrorNueva(body.error ?? "No se pudo crear la empresa");
    // Pasa directo a gestionar la empresa recién creada.
    elegirEmpresaActiva(body.empresa.id);
  }

  async function transferir(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId || !destinoTransferir) return;
    setMensajeTransferir(null);
    setTransfiriendo(true);
    const res = await fetch("/api/empresas/transferir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, nuevoDuenoId: destinoTransferir }),
    });
    const body = await res.json();
    setTransfiriendo(false);
    if (!res.ok) return setMensajeTransferir({ tipo: "error", texto: body.error ?? "No se pudo transferir" });
    setMensajeTransferir({ tipo: "ok", texto: "Listo. Ahora eres administrador, ya no dueño, de esta empresa." });
    setRol("admin");
  }

  async function eliminarEmpresa(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId || confirmarNombre.trim() !== nombre.trim()) return;
    setErrorEliminar(null);
    setEliminando(true);
    const res = await fetch("/api/empresas/eliminar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId }),
    });
    if (!res.ok) {
      const body = await res.json();
      setEliminando(false);
      return setErrorEliminar(body.error ?? "No se pudo eliminar");
    }
    window.location.href = "/dashboard";
  }

  if (cargando) return null;

  const puedeEditar = rol === "dueno" || rol === "admin";
  const puedeCrearOtra = limites && limites.propias < limites.maxPropias;

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Mi empresa</h1>
          <p className="suave">Datos del negocio que estás gestionando ahora, y a cuáles más tienes acceso.</p>
        </div>
      </div>

      {empresas.length > 1 && (
        <div className="tarjeta" style={{ maxWidth: 460, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Cambiar de empresa</h3>
          <p className="suave pequeno" style={{ marginBottom: 10 }}>Gestionas más de un negocio en Frondix.</p>
          <select value={empresaId ?? ""} onChange={(e) => elegirEmpresaActiva(e.target.value)}>
            {empresas.map((e) => (
              <option key={e.empresaId} value={e.empresaId}>
                {e.nombre} {e.rol === "dueno" ? "(tuya)" : "(invitado)"}
              </option>
            ))}
          </select>
        </div>
      )}

      <form onSubmit={guardar} className="tarjeta" style={{ maxWidth: 460, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Datos del negocio</h3>
        <div className="campo">
          <label htmlFor="nombre-empresa">Nombre de tu negocio</label>
          <input id="nombre-empresa" value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={!puedeEditar} />
        </div>
        <div className="campo">
          <label htmlFor="telefono-empresa">WhatsApp del negocio</label>
          <input
            id="telefono-empresa"
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

      {limites && (
        <div className="tarjeta" style={{ maxWidth: 460 }}>
          <h3 style={{ marginTop: 0 }}>Otra empresa</h3>
          <p className="suave pequeno" style={{ marginBottom: 14 }}>
            Tienes {limites.propias} de {limites.maxPropias} empresas propias
            {limites.pagado ? " (plan pago)" : " (plan gratis)"}.
          </p>

          {!creando && puedeCrearOtra && (
            <button type="button" className="btn btn-secundario" onClick={() => setCreando(true)}>
              + Crear otra empresa
            </button>
          )}
          {!puedeCrearOtra && (
            <p className="suave pequeno">
              Llegaste al tope de tu plan.{!limites.pagado && " Activa el plan pago en alguna de tus empresas para crear hasta 5."}
            </p>
          )}

          {creando && (
            <form onSubmit={crearEmpresa} style={{ marginTop: 10 }}>
              <div className="campo">
                <label htmlFor="nombre-nueva">Nombre del negocio nuevo</label>
                <input id="nombre-nueva" value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} required autoFocus />
              </div>
              <div className="campo">
                <label htmlFor="telefono-nueva">WhatsApp del negocio</label>
                <input
                  id="telefono-nueva"
                  type="tel"
                  inputMode="numeric"
                  value={telefonoNueva}
                  onChange={(e) => setTelefonoNueva(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="987654321"
                  required
                />
              </div>
              {errorNueva && <p className="alerta alerta-error" role="alert">{errorNueva}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primario" disabled={enviandoNueva}>
                  {enviandoNueva ? "Creando..." : "Crear empresa"}
                </button>
                <button type="button" className="btn btn-fantasma" onClick={() => setCreando(false)} disabled={enviandoNueva}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {rol === "dueno" && (
        <div className="tarjeta" style={{ maxWidth: 460, marginTop: 20, borderColor: "var(--error-100)" }}>
          <h3 style={{ marginTop: 0 }}>Zona de riesgo</h3>

          {otrosMiembros.length > 0 && (
            <form onSubmit={transferir} style={{ marginBottom: 20 }}>
              <p className="suave pequeno" style={{ marginBottom: 8 }}>
                Pasa la propiedad de esta empresa a alguien más del equipo. Tú quedas como administrador, no pierdes el acceso.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={destinoTransferir} onChange={(e) => setDestinoTransferir(e.target.value)} required>
                  <option value="">Elige a quién...</option>
                  {otrosMiembros.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.email}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-secundario" disabled={transfiriendo || !destinoTransferir}>
                  {transfiriendo ? "Transfiriendo..." : "Transferir empresa"}
                </button>
              </div>
              {mensajeTransferir && (
                <p className={`alerta alerta-${mensajeTransferir.tipo}`} role="status" style={{ marginTop: 10 }}>{mensajeTransferir.texto}</p>
              )}
            </form>
          )}

          <form onSubmit={eliminarEmpresa}>
            <p className="suave pequeno" style={{ marginBottom: 8 }}>
              Elimina &quot;{nombre}&quot; para siempre: módulos, registros, equipo, todo. No se puede deshacer.
              Escribe el nombre exacto para confirmar.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={confirmarNombre}
                onChange={(e) => setConfirmarNombre(e.target.value)}
                placeholder={nombre}
                aria-label="Escribe el nombre de la empresa para confirmar"
              />
              <button
                type="submit"
                className="btn btn-primario"
                style={{ background: "var(--error)" }}
                disabled={eliminando || confirmarNombre.trim() !== nombre.trim()}
              >
                {eliminando ? "Eliminando..." : "Eliminar empresa"}
              </button>
            </div>
            {errorEliminar && <p className="alerta alerta-error" role="alert" style={{ marginTop: 10 }}>{errorEliminar}</p>}
          </form>
        </div>
      )}
    </>
  );
}
