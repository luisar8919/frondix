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

  const [factproRuc, setFactproRuc] = useState("");
  const [factproToken, setFactproToken] = useState<string | null>(null);
  const [factproEntorno, setFactproEntorno] = useState<string>("demo");
  const [factproRucForm, setFactproRucForm] = useState("");
  const [factproDireccion, setFactproDireccion] = useState("");
  const [factproUbigeo, setFactproUbigeo] = useState("");
  const [activandoFactpro, setActivandoFactpro] = useState(false);
  const [pasandoProduccion, setPasandoProduccion] = useState(false);
  const [mensajeFactpro, setMensajeFactpro] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [desconectandoTelegram, setDesconectandoTelegram] = useState(false);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsuario, setSmtpUsuario] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpHayPassword, setSmtpHayPassword] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpActivo, setSmtpActivo] = useState(false);
  const [guardandoSmtp, setGuardandoSmtp] = useState(false);
  const [probandoSmtp, setProbandoSmtp] = useState(false);
  const [mensajeSmtp, setMensajeSmtp] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

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

    const { data: empresa } = await supabase
      .from("empresas")
      .select("nombre, telefono, ruc, factpro_token, factpro_entorno, telegram_chat_id")
      .eq("id", sesion.empresaId)
      .single();
    if (empresa) {
      setNombre(empresa.nombre ?? "");
      setTelefono(empresa.telefono ?? "");
      setFactproRuc(empresa.ruc ?? "");
      setFactproToken(empresa.factpro_token ?? null);
      setFactproEntorno(empresa.factpro_entorno ?? "demo");
      setTelegramChatId(empresa.telegram_chat_id ?? null);
    }

    const miRolActual = sesion.empresas.find((e) => e.empresaId === sesion.empresaId)?.rol;
    if (miRolActual === "dueno") {
      const resMiembros = await fetch(`/api/team/miembros?empresaId=${sesion.empresaId}`);
      const bodyMiembros = await resMiembros.json();
      if (resMiembros.ok) setOtrosMiembros(bodyMiembros.miembros.filter((m: { rol: string }) => m.rol !== "dueno"));
    }

    if (miRolActual === "dueno" || miRolActual === "admin") {
      const resSmtp = await fetch(`/api/empresas/smtp?empresaId=${sesion.empresaId}`);
      const bodySmtp = await resSmtp.json();
      if (resSmtp.ok) {
        setSmtpHost(bodySmtp.host);
        setSmtpPort(String(bodySmtp.port));
        setSmtpUsuario(bodySmtp.usuario);
        setSmtpFrom(bodySmtp.from);
        setSmtpActivo(bodySmtp.activo);
        setSmtpHayPassword(bodySmtp.hayPassword);
      }
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

  async function activarFactpro(e: React.FormEvent) {
    e.preventDefault();
    setActivandoFactpro(true);
    setMensajeFactpro(null);
    const res = await fetch("/api/facturacion-electronica/activar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruc: factproRucForm, direccion: factproDireccion, ubigeoId: factproUbigeo }),
    });
    const body = await res.json();
    setActivandoFactpro(false);
    if (!res.ok) return setMensajeFactpro({ tipo: "error", texto: body.error ?? "No se pudo activar" });
    setFactproRuc(factproRucForm);
    setFactproToken("activo"); // no necesitamos el token real en el cliente, solo saber que ya existe
    setMensajeFactpro({ tipo: "ok", texto: "Listo. Ahora haz el Alta de PSE en SUNAT (ver abajo) antes de pasar a producción." });
  }

  async function pasarAProduccion() {
    setPasandoProduccion(true);
    setMensajeFactpro(null);
    const res = await fetch("/api/facturacion-electronica/produccion", { method: "POST" });
    const body = await res.json();
    setPasandoProduccion(false);
    if (!res.ok) return setMensajeFactpro({ tipo: "error", texto: body.error ?? "No se pudo pasar a producción" });
    setFactproEntorno("produccion");
    setMensajeFactpro({ tipo: "ok", texto: "Listo, tu empresa ya factura en producción." });
  }

  async function guardarSmtp(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId) return;
    setGuardandoSmtp(true);
    setMensajeSmtp(null);
    const res = await fetch("/api/empresas/smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId, host: smtpHost, port: Number(smtpPort), usuario: smtpUsuario, password: smtpPassword, from: smtpFrom, activo: smtpActivo }),
    });
    const body = await res.json();
    setGuardandoSmtp(false);
    if (!res.ok) return setMensajeSmtp({ tipo: "error", texto: body.error ?? "No se pudo guardar" });
    if (smtpPassword.trim()) setSmtpHayPassword(true);
    setSmtpPassword("");
    setMensajeSmtp({ tipo: "ok", texto: "Guardado." });
  }

  async function probarSmtp() {
    if (!empresaId) return;
    setProbandoSmtp(true);
    setMensajeSmtp(null);
    const res = await fetch("/api/empresas/smtp/probar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId }),
    });
    const body = await res.json();
    setProbandoSmtp(false);
    setMensajeSmtp(res.ok ? { tipo: "ok", texto: `Correo de prueba enviado a ${body.enviadoA}. Revisa esa bandeja.` } : { tipo: "error", texto: body.error ?? "No se pudo enviar la prueba" });
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

      {puedeEditar && (
        <form onSubmit={guardarSmtp} className="tarjeta" style={{ maxWidth: 460, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Correo propio al cliente</h3>
          <p className="suave pequeno" style={{ marginBottom: 14 }}>
            Cuando actives una receta de "Enviarle un correo al cliente", le va a llegar desde tu propia casilla (ej. tu
            Gmail o el correo de tu negocio) en vez de desde Frondix. Sin esto configurado, sigue funcionando igual pero
            con el remitente de Frondix.
          </p>

          <div className="campo">
            <label htmlFor="smtp-host">Servidor SMTP (host)</label>
            <input id="smtp-host" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div className="campo">
            <label htmlFor="smtp-port">Puerto</label>
            <input id="smtp-port" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
            <p className="ayuda">Usa 587 o 465, el que te haya dado tu proveedor de correo.</p>
          </div>
          <div className="campo">
            <label htmlFor="smtp-usuario">Usuario</label>
            <input id="smtp-usuario" value={smtpUsuario} onChange={(e) => setSmtpUsuario(e.target.value)} placeholder="tucorreo@tudominio.com" />
          </div>
          <div className="campo">
            <label htmlFor="smtp-password">Contraseña</label>
            <input
              id="smtp-password"
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder={smtpHayPassword ? "••••••••  (ya guardada, déjalo vacío para no cambiarla)" : "Tu contraseña o contraseña de aplicación"}
            />
          </div>
          <div className="campo">
            <label htmlFor="smtp-from">Remitente que verá tu cliente</label>
            <input id="smtp-from" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="Mi Negocio <tucorreo@tudominio.com>" />
          </div>
          <div className="campo" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input id="smtp-activo" type="checkbox" checked={smtpActivo} onChange={(e) => setSmtpActivo(e.target.checked)} style={{ width: "auto" }} />
            <label htmlFor="smtp-activo" style={{ margin: 0 }}>Usar este SMTP para los correos al cliente</label>
          </div>

          {mensajeSmtp && <p className={`alerta alerta-${mensajeSmtp.tipo}`} role="status">{mensajeSmtp.texto}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="submit" className="btn btn-primario" disabled={guardandoSmtp}>
              {guardandoSmtp ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" className="btn btn-secundario" onClick={probarSmtp} disabled={probandoSmtp || !smtpHayPassword}>
              {probandoSmtp ? "Enviando..." : "Enviar correo de prueba"}
            </button>
          </div>
        </form>
      )}

      {puedeEditar && (
        <div className="tarjeta" style={{ maxWidth: 460, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Facturación electrónica</h3>

          {!factproToken && (
            <form onSubmit={activarFactpro}>
              <p className="suave pequeno" style={{ marginBottom: 14 }}>
                Emite facturas y boletas válidas ante SUNAT directo desde Frondix. Completa estos datos para registrar tu
                empresa.
              </p>
              <div className="campo">
                <label htmlFor="factpro-ruc">RUC</label>
                <input id="factpro-ruc" value={factproRucForm} onChange={(e) => setFactproRucForm(e.target.value.replace(/\D/g, "").slice(0, 11))} required />
              </div>
              <div className="campo">
                <label htmlFor="factpro-direccion">Dirección fiscal</label>
                <input id="factpro-direccion" value={factproDireccion} onChange={(e) => setFactproDireccion(e.target.value)} required />
              </div>
              <div className="campo">
                <label htmlFor="factpro-ubigeo">Ubigeo (código de 6 dígitos)</label>
                <input id="factpro-ubigeo" value={factproUbigeo} onChange={(e) => setFactproUbigeo(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="150101" required />
                <p className="ayuda">
                  Busca tu distrito en el{" "}
                  <a href="https://www.sunat.gob.pe/cl-ti-itmerced/jcrS00Alias" target="_blank" rel="noreferrer">buscador de ubigeos de SUNAT</a>.
                </p>
              </div>
              {mensajeFactpro && <p className={`alerta alerta-${mensajeFactpro.tipo}`} role="status">{mensajeFactpro.texto}</p>}
              <button type="submit" className="btn btn-primario" disabled={activandoFactpro}>
                {activandoFactpro ? "Activando..." : "Activar facturación electrónica"}
              </button>
            </form>
          )}

          {factproToken && (
            <>
              <p className="suave pequeno" style={{ marginBottom: 14 }}>RUC {factproRuc} registrado.</p>

              <ol className="pequeno" style={{ paddingLeft: 18, marginBottom: 14 }}>
                <li>✅ Empresa y series creadas en Frondix.</li>
                <li>
                  {factproEntorno === "produccion" ? "✅" : "⬜"} Hacer el <strong>Alta de PSE</strong> en SUNAT (ver tutorial
                  abajo) — lo haces tú mismo, con tu propia Clave SOL. Frondix nunca te pide esa contraseña.
                </li>
                <li>{factproEntorno === "produccion" ? "✅" : "⬜"} Pasar a producción (recién al día siguiente del Alta de PSE).</li>
              </ol>

              <details style={{ marginBottom: 14 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>¿Cómo hago el Alta de PSE en SUNAT?</summary>
                <ol className="pequeno" style={{ paddingLeft: 18, marginTop: 10 }}>
                  <li>Entra a <a href="https://www.sunat.gob.pe/sol.html" target="_blank" rel="noreferrer">SUNAT Operaciones en Línea</a> con tu RUC, usuario y Clave SOL.</li>
                  <li>En el buscador principal, escribe <strong>&quot;altas&quot;</strong> y entra a <strong>&quot;Altas/Bajas de PSE&quot;</strong>.</li>
                  <li>En <strong>&quot;Comunicación Tercerización con PSE&quot;</strong>, haz clic en <strong>&quot;Alta Servicio&quot;</strong>.</li>
                  <li>
                    Agrega el RUC <strong>20600337832</strong> (VIDA SOFTWARE S.A.C., el PSE que usa Frondix) y guarda.
                  </li>
                  <li>La autorización entra en vigencia recién al <strong>día siguiente</strong> — hazlo con 1-2 días de anticipación antes de necesitar facturar de verdad.</li>
                </ol>
              </details>

              {factproEntorno !== "produccion" && (
                <button type="button" className="btn btn-primario" onClick={pasarAProduccion} disabled={pasandoProduccion}>
                  {pasandoProduccion ? "Pasando a producción..." : "Ya hice el Alta de PSE, pasar a producción"}
                </button>
              )}
              {factproEntorno === "produccion" && <p className="alerta alerta-ok">Ya estás emitiendo en producción.</p>}

              {mensajeFactpro && <p className={`alerta alerta-${mensajeFactpro.tipo}`} role="status" style={{ marginTop: 10 }}>{mensajeFactpro.texto}</p>}
            </>
          )}
        </div>
      )}

      {puedeEditar && (
        <div className="tarjeta" style={{ maxWidth: 460, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Notificaciones por Telegram</h3>
          {telegramChatId ? (
            <>
              <p className="alerta alerta-ok">Conectado. Acá te vamos a avisar de clientes inactivos y otras alertas.</p>
              <button type="button" className="btn btn-secundario" disabled={desconectandoTelegram} onClick={async () => {
                setDesconectandoTelegram(true);
                const res = await fetch("/api/telegram/desconectar", { method: "POST" });
                setDesconectandoTelegram(false);
                if (res.ok) setTelegramChatId(null);
              }}>
                {desconectandoTelegram ? "Desconectando..." : "Desconectar"}
              </button>
            </>
          ) : process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ? (
            <>
              <p className="suave pequeno" style={{ marginBottom: 14 }}>
                Recibe las mismas alertas que por WhatsApp (clientes inactivos, etc.) directo en Telegram.
              </p>
              <a
                href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=${empresaId}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primario"
              >
                Conectar con Telegram
              </a>
            </>
          ) : (
            <p className="suave pequeno">Todavía no está disponible.</p>
          )}
        </div>
      )}

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
