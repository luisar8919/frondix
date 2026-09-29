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
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = crearClienteBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");

      const { data: miembro } = await supabase.from("miembros").select("empresa_id").eq("user_id", user.id).limit(1).single();
      if (miembro) {
        router.replace("/dashboard");
        router.refresh();
      } else {
        setCargando(false);
      }
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const res = await fetch("/api/empresas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombreEmpresa }),
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
