"use client";

import { useEffect, useState, use } from "react";
import { normalizarTelefonoPE, enlaceWhatsApp } from "@/lib/seguimiento";

interface Producto { producto: string; precio: number | null; disponible: boolean }
interface Catalogo { nombre: string; telefono: string | null; productos: Producto[] }

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 2 })}`;

// Catálogo público de solo lectura -- sin sesión, para compartir por
// WhatsApp. Ver /api/catalogo/[empresaId] y el toggle en Mi empresa.
export default function CatalogoPublico({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const [datos, setDatos] = useState<Catalogo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/catalogo/${empresaId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) return setError(body.error ?? "No se pudo cargar el catálogo");
        setDatos(body);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, [empresaId]);

  const telefono = datos?.telefono ? normalizarTelefonoPE(datos.telefono) : null;

  return (
    <div className="contenedor" style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px" }}>
      {error && <p className="alerta alerta-error" role="alert">{error}</p>}
      {!datos && !error && <p className="suave">Cargando...</p>}

      {datos && (
        <>
          <h1>{datos.nombre}</h1>
          <p className="suave" style={{ marginBottom: 20 }}>Catálogo de productos</p>

          {datos.productos.length === 0 && <p className="suave">Todavía no hay productos cargados.</p>}

          {datos.productos.map((p) => (
            <div key={p.producto} className="tarjeta" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <strong>{p.producto}</strong>
                {!p.disponible && <p className="suave pequeno" style={{ margin: "2px 0 0" }}>Agotado</p>}
              </div>
              {p.precio !== null && <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{soles(p.precio)}</span>}
            </div>
          ))}

          {telefono && (
            <a
              href={enlaceWhatsApp(telefono, `Hola, vi tu catálogo y quería consultar`)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primario btn-grande btn-bloque"
              style={{ marginTop: 20 }}
            >
              Escribir por WhatsApp
            </a>
          )}
        </>
      )}
    </div>
  );
}
