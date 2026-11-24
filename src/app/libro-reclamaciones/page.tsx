"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

// Libro de Reclamaciones Virtual -- requisito legal de INDECOPI para
// cualquier proveedor que venda bienes/servicios en Peru (D.S. 101-2022-PCM),
// no solo un pedido de Culqi. Campos minimos exigidos por ley; borrador propio
// sin revision de un abogado todavia (mismo criterio que /terminos).
const TIPOS_DOCUMENTO = ["DNI", "Carnet de Extranjeria", "Pasaporte", "RUC"];

export default function LibroReclamacionesPage() {
  const [tipo, setTipo] = useState<"reclamo" | "queja">("reclamo");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [documentoTipo, setDocumentoTipo] = useState("DNI");
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [esMenorEdad, setEsMenorEdad] = useState(false);
  const [tutorNombre, setTutorNombre] = useState("");
  const [bienContratado, setBienContratado] = useState("");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [pedido, setPedido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<{ codigo: string } | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    const res = await fetch("/api/libro-reclamaciones/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo, nombre, apellido, documentoTipo, documentoNumero, domicilio,
        telefono, correo, esMenorEdad, tutorNombre, bienContratado,
        monto: monto || null, descripcion, pedido,
      }),
    });
    const resBody = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) { setError(resBody.error ?? "No se pudo registrar el reclamo"); return; }
    setResultado({ codigo: resBody.codigo });
  }

  if (resultado) {
    return (
      <>
        <header className="cabecera no-imprimir">
          <div className="contenedor cabecera-fila"><Logo /></div>
        </header>
        <main className="contenedor" style={{ maxWidth: 560, padding: "40px 16px 80px" }}>
          <h1>Reclamo registrado</h1>
          <p className="alerta alerta-ok">
            Tu código de seguimiento es <strong>{resultado.codigo}</strong>. Guárdalo o imprime esta página.
          </p>
          <p>
            Según el Código de Protección y Defensa del Consumidor, tienes derecho a una respuesta en un plazo
            máximo de 30 días calendario. Te contestaremos al correo que indicaste.
          </p>
          <div className="no-imprimir" style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-secundario" onClick={() => window.print()}>Imprimir / Guardar PDF</button>
            <Link href="/" className="btn btn-primario">Volver al inicio</Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="contenedor" style={{ maxWidth: 560, padding: "40px 16px 80px" }}>
        <h1>Libro de Reclamaciones Virtual</h1>
        <p className="suave">
          Conforme a lo establecido en el Código de Protección y Defensa del Consumidor, este establecimiento cuenta
          con un Libro de Reclamaciones.
        </p>

        <form onSubmit={enviar}>
          <h2>1. Identificación del consumidor</h2>
          <div className="campo">
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as "reclamo" | "queja")}>
              <option value="reclamo">Reclamo (disconformidad con el producto o servicio)</option>
              <option value="queja">Queja (disconformidad con la atención, no relacionada al producto/servicio)</option>
            </select>
          </div>
          <div className="campo"><label>Nombres *</label><input required value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="campo"><label>Apellidos *</label><input required value={apellido} onChange={(e) => setApellido(e.target.value)} /></div>
          <div className="campo">
            <label>Tipo de documento *</label>
            <select value={documentoTipo} onChange={(e) => setDocumentoTipo(e.target.value)}>
              {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="campo"><label>N° de documento *</label><input required value={documentoNumero} onChange={(e) => setDocumentoNumero(e.target.value)} /></div>
          <div className="campo"><label>Domicilio *</label><input required value={domicilio} onChange={(e) => setDomicilio(e.target.value)} /></div>
          <div className="campo"><label>Teléfono</label><input value={telefono} onChange={(e) => setTelefono(e.target.value)} /></div>
          <div className="campo"><label>Correo electrónico *</label><input required type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} /></div>
          <div className="campo">
            <label><input type="checkbox" checked={esMenorEdad} onChange={(e) => setEsMenorEdad(e.target.checked)} /> Soy menor de edad</label>
          </div>
          {esMenorEdad && (
            <div className="campo"><label>Nombre del padre, madre o tutor *</label><input required value={tutorNombre} onChange={(e) => setTutorNombre(e.target.value)} /></div>
          )}

          <h2>2. Identificación del bien contratado</h2>
          <div className="campo"><label>Producto o servicio *</label><input required placeholder="Ej. Plan Mensual Frondix" value={bienContratado} onChange={(e) => setBienContratado(e.target.value)} /></div>
          <div className="campo"><label>Monto reclamado (si aplica)</label><input type="number" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} /></div>

          <h2>3. Detalle</h2>
          <div className="campo"><label>Descripción de los hechos *</label><textarea required rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></div>
          <div className="campo"><label>¿Qué pides como solución? *</label><textarea required rows={3} value={pedido} onChange={(e) => setPedido(e.target.value)} /></div>

          {error && <p className="alerta alerta-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primario" disabled={enviando} style={{ marginTop: 16 }}>
            {enviando ? "Enviando..." : "Enviar"}
          </button>
        </form>

        <p style={{ marginTop: 32 }}>
          <Link href="/">Volver al inicio</Link>
        </p>
      </main>
    </>
  );
}
