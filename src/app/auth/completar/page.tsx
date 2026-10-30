"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { CATEGORIAS_MODULOS } from "@/lib/plantillasModulo";

// Aterriza aquí cualquier login (Google u otro que se sume después), la
// invitación a un equipo y la recuperación de contraseña. Cuatro casos:
// 1. Primera vez con Google (sin empresa todavía): pide el nombre del negocio,
//    igual que el signup por email, y de ahí pasa al paso "rubro" (nuevo).
// 2. Invitado (?type=invite, ver /auth/confirm): ya tiene empresa asignada (el
//    que invita la crea al mandar la invitación) pero nunca puso una contraseña
//    -- nunca pasó por el formulario de signup, que es donde se define. Se le
//    pide una antes de entrar. Nunca pasa por "rubro": la empresa ya existe,
//    la creó el que invita.
// 3. Recuperando su contraseña (?type=recovery, ver /recuperar): mismo paso de
//    contraseña que el invitado, pero ya tiene cuenta y empresa de antes.
// 4. Ya tiene cuenta y empresa, sin pedir contraseña (volvió a confirmar un
//    enlace viejo, por ejemplo): pasa directo al panel.
export default function CompletarPage() {
  return (
    <Suspense fallback={null}>
      <CompletarForm />
    </Suspense>
  );
}

function CompletarForm() {
  const [cargando, setCargando] = useState(true);
  const [paso, setPaso] = useState<"empresa" | "password" | "rubro" | null>(null);
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Paso "rubro": nace recién al crear la empresa (ver onSubmitEmpresa), antes
  // no hay empresaId ni tiene sentido preguntar nada de esto.
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [rubro, setRubro] = useState<(typeof CATEGORIAS_MODULOS)[number] | null>(null);
  const router = useRouter();
  const tipo = useSearchParams().get("type");
  const pidePassword = tipo === "invite" || tipo === "recovery";

  useEffect(() => {
    const supabase = crearClienteBrowser();
    let activo = true;

    // El enlace de confirmación de correo llega con la sesión en el fragmento de la
    // URL (#access_token=...), que el cliente procesa en segundo plano al cargar la
    // página. Preguntar "¿hay usuario?" de una (getUser de una sola vez) corre antes
    // de que termine ese procesamiento y manda a /login por error. onAuthStateChange
    // avisa recién cuando el cliente terminó de resolver la sesión real (incluido el
    // fragmento, si había uno), así que no hay carrera.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, session) => {
      if (!activo) return;
      if (session?.user) {
        supabase.from("miembros").select("empresa_id").eq("user_id", session.user.id).limit(1).single()
          .then(({ data: miembro }) => {
            if (!activo) return;
            if (miembro && pidePassword) {
              setPaso("password");
              setCargando(false);
            } else if (miembro) {
              // Navegación dura: dashboard/layout.tsx vuelve a validar la sesión en el
              // servidor, y un push suave puede llegar antes de que la cookie termine
              // de propagarse (ver login/page.tsx para el mismo caso).
              window.location.href = "/dashboard";
            } else {
              setPaso("empresa");
              setCargando(false);
            }
          });
      } else if (evento === "INITIAL_SESSION") {
        router.replace("/login");
      }
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, [router, pidePassword]);

  async function onSubmitEmpresa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const res = await fetch("/api/empresas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombreEmpresa, telefono }),
    });
    const body = await res.json();
    setEnviando(false);
    if (!res.ok) return setError(body.error ?? "No se pudo crear la empresa");
    setEmpresaId(body.empresa.id);
    setPaso("rubro");
  }

  // Crea Ventas y Compras (mismo /api/datasets/crear de siempre, tipo fijo) y
  // manda al selector de módulos ya filtrado por el rubro elegido -- no repite
  // la pregunta del tipo de negocio, ver ?categoria en dashboard/modulos/nuevo.
  async function empezarDeCero() {
    if (!empresaId) return;
    setEnviando(true);
    await Promise.all([
      fetch("/api/datasets/crear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresaId, tipo: "ventas" }) }),
      fetch("/api/datasets/crear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresaId, tipo: "compras" }) }),
    ]);
    window.location.href = rubro ? `/dashboard/modulos/nuevo?categoria=${rubro.clave}` : "/dashboard";
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const supabase = crearClienteBrowser();
    const { error: errorPass } = await supabase.auth.updateUser({ password });
    setEnviando(false);
    if (errorPass) return setError(errorPass.message);
    window.location.href = "/dashboard";
  }

  if (cargando || !paso) return null;

  return (
    <div className="auth">
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="auth-centro">
        <div className="tarjeta tarjeta-elevada auth-tarjeta">
          {paso === "rubro" ? (
            <>
              {!rubro ? (
                <>
                  <h1>Ya casi</h1>
                  <p className="suave">¿A qué rubro perteneces? Según eso te sugerimos las tablas que te podrían servir.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {CATEGORIAS_MODULOS.map((c) => (
                      <button
                        key={c.clave}
                        type="button"
                        className="tarjeta tarjeta-tabla"
                        style={{ textAlign: "left", cursor: "pointer", padding: 14 }}
                        onClick={() => setRubro(c)}
                      >
                        <strong>{c.titulo}</strong>
                        <p className="suave pequeno" style={{ margin: "2px 0 0" }}>{c.descripcion}</p>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-fantasma btn-bloque" style={{ marginTop: 14 }} onClick={() => (window.location.href = "/dashboard")}>
                    Ninguna de estas, prefiero elegir después
                  </button>
                </>
              ) : (
                <>
                  <h1>Ya casi</h1>
                  <p className="suave">¿Tienes un Excel con la información que ya manejas, o empezamos las tablas desde cero?</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                    <button type="button" className="btn btn-primario btn-grande btn-bloque" disabled={enviando} onClick={() => (window.location.href = "/dashboard/upload")}>
                      Tengo un Excel
                    </button>
                    <button type="button" className="btn btn-secundario btn-grande btn-bloque" disabled={enviando} onClick={empezarDeCero}>
                      {enviando ? "Creando tus módulos..." : "Empezar desde cero"}
                    </button>
                  </div>
                  <button type="button" className="btn btn-fantasma btn-bloque" style={{ marginTop: 14 }} onClick={() => setRubro(null)} disabled={enviando}>
                    ← Elegir otro rubro
                  </button>
                </>
              )}
            </>
          ) : paso === "password" ? (
            <>
              <h1>Ya casi</h1>
              <p className="suave">
                {tipo === "recovery"
                  ? "Pon tu contraseña nueva."
                  : "Te invitaron a un equipo en Frondix. Crea una contraseña para poder volver a entrar."}
              </p>
              <form onSubmit={onSubmitPassword}>
                <div className="campo">
                  <label htmlFor="password">Contraseña</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoFocus
                  />
                  <p className="ayuda">Mínimo 6 caracteres.</p>
                </div>
                {error && <p className="alerta alerta-error" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primario btn-grande btn-bloque" disabled={enviando}>
                  {enviando ? "Guardando..." : "Entrar a Frondix"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1>Ya casi</h1>
              <p className="suave">¿Cómo se llama tu negocio?</p>
              <form onSubmit={onSubmitEmpresa}>
                <div className="campo">
                  <label htmlFor="negocio">Nombre de tu negocio</label>
                  <input id="negocio" value={nombreEmpresa} onChange={(e) => setNombreEmpresa(e.target.value)} placeholder="Ej. Taller Los Andes" required autoFocus />
                </div>
                <div className="campo">
                  <label htmlFor="telefono">WhatsApp del negocio</label>
                  <input id="telefono" type="tel" inputMode="numeric" value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="987654321" required />
                  <p className="ayuda">9 dígitos, sin +51. Para avisos de tu cuenta y, de vez en cuando, alguna promoción.</p>
                </div>
                {error && <p className="alerta alerta-error" role="alert">{error}</p>}
                <button type="submit" className="btn btn-primario btn-grande btn-bloque" disabled={enviando}>
                  {enviando ? "Creando tu cuenta..." : "Entrar a Frondix"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
