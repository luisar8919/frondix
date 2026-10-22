"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// "Proveedor > Registrar" en la barra: agregar un proveedor a mano, antes de
// la primera compra (que es cuando normalmente aparecería solo). Espejo del
// "+ Nuevo prospecto" de Pipeline para clientes.
export default function NuevoProveedorPage() {
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
    const res = await fetch("/api/proveedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, telefono }),
    });
    setEnviando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setError(body.error ?? "No se pudo guardar el proveedor");
    }
    router.push(`/dashboard/proveedores/${encodeURIComponent(nombre.trim())}`);
  }

  return (
    <>
      <div className="panel-cabecera">
        <div>
          <p className="suave pequeno" style={{ margin: "0 0 4px" }}><Link href="/dashboard/proveedores">← Proveedores</Link></p>
          <h1>Nuevo proveedor</h1>
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
          {enviando ? "Guardando..." : "Guardar proveedor"}
        </button>
      </form>
    </>
  );
}
