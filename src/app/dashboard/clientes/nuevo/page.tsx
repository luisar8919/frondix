"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Espejo de /dashboard/proveedores/nuevo: agregar un cliente a mano, antes de
// su primera compra (que es cuando normalmente aparecería solo).
export default function NuevoClientePage() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setEnviando(true);
    setError("");
    const res = await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, telefono }),
    });
    setEnviando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setError(body.error ?? "No se pudo guardar el cliente");
    }
    router.push(`/dashboard/clientes/${encodeURIComponent(nombre.trim())}`);
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <p className="suave pequeno" style={{ margin: "0 0 4px" }}><Link href="/dashboard/clientes">← Clientes</Link></p>
          <h1>Nuevo cliente</h1>
        </div>
      </div>

      <form onSubmit={onSubmit} className="tarjeta" style={{ maxWidth: 420 }}>
        <div className="campo">
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus maxLength={120} />
        </div>
        <div className="campo">
          <label htmlFor="telefono">Teléfono (opcional)</label>
          <input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={30} />
        </div>
        {error && <p className="alerta alerta-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primario" disabled={enviando || !nombre.trim()}>
          {enviando ? "Guardando..." : "Guardar cliente"}
        </button>
      </form>
    </>
  );
}
