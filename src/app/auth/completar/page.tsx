"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteBrowser } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

// Aterriza aquí cualquier login (Google u otro que se sume después). Si el usuario
// ya tiene una empresa (ya usaba Frondix, o lo invitaron a una), pasa directo al
// panel. Si es la primera vez (recién creó su cuenta con Google), pide el nombre
// del negocio antes de entrar — el mismo paso que ya hacía el signup por email.
export default function CompletarPage() {
  const [cargando, setCargando] = useState(true);
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

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
            if (miembro) {
              router.replace("/dashboard");
              router.refresh();
            } else {
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
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const res = await fetch("/api/empresas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombreEmpresa, telefono }),
    });
    if (!res.ok) {
      const body = await res.json();
      setEnviando(false);
      return setError(body.error ?? "No se pudo crear la empresa");
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (cargando) return null;

  return (
    <div className="auth">
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="auth-centro">
        <div className="tarjeta tarjeta-elevada auth-tarjeta">
          <h1>Ya casi</h1>
          <p className="suave">¿Cómo se llama tu negocio?</p>
          <form onSubmit={onSubmit}>
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
        </div>
      </main>
    </div>
  );
}
