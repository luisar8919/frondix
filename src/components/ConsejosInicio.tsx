"use client";

import { useState } from "react";

interface Consejo { titulo: string; texto: string }

const CONSEJOS: Consejo[] = [
  {
    titulo: "Marca el rol de cada columna",
    texto: "En \"Editar tabla y campos\" dile a Frondix qué significa cada columna (Cliente, Producto, Monto, Fecha...). De eso dependen Reportes, Seguimiento, Stock y Cuentas por cobrar -- sin marcarlo, esas funciones no tienen de dónde sacar los datos.",
  },
  {
    titulo: "Agrega una columna de Teléfono a tus Ventas",
    texto: "Si marcas una columna como Teléfono en tu módulo de Ventas, Seguimiento te arma el enlace de WhatsApp listo para escribirle a cada cliente que no volvió, con un mensaje ya redactado.",
  },
  {
    titulo: "Un módulo de Stock aparte, enlazado a Ventas y Compras",
    texto: "Crea un módulo con columnas Producto y Cantidad (llámalo como quieras) y enlaza la columna Producto de Ventas y de Compras a ese Stock. Así ves alertas cuando un producto está por agotarse y cuánto vale tu inventario en Reportes.",
  },
  {
    titulo: "Marca \"Stock mínimo\" para que te avise a tiempo",
    texto: "En tu módulo de Stock, agrega una columna con rol \"Stock mínimo\" por producto. Cuando la cantidad baje de ese número, te va a aparecer en \"Stock por agotarse\" en Inicio.",
  },
  {
    titulo: "Ventas a crédito: usa \"Saldo pendiente\"",
    texto: "Si le fías a algún cliente, agrega una columna Monto numérica con rol \"Saldo pendiente\" en Ventas. Cualquier fila con un valor mayor a 0 ahí aparece en Cuentas por cobrar.",
  },
  {
    titulo: "Enlaza tus tablas entre sí",
    texto: "Cualquier columna de texto se puede enlazar a otra tabla (por ejemplo, Cliente en Ventas -> tu lista de Clientes). Eso te da autocompletado al cargar datos y evita que el mismo cliente quede escrito de formas distintas.",
  },
  {
    titulo: "Activa el seguimiento cliente por cliente",
    texto: "En Seguimiento, el check \"Avisarme en la app\" por cada cliente te manda una notificación push a tu celular en cuanto se cumplen los días sin que vuelva a comprar -- no hace falta entrar a revisar todos los días.",
  },
  {
    titulo: "Invita a tu equipo con el rol correcto",
    texto: "Desde Equipo puedes sumar vendedores: ven el stock y registran ventas, pero no ven tus módulos de Compras ni tus costos. Tú y los demás dueños/admins sí ven todo.",
  },
  {
    titulo: "Revisa Reportes -> Balance para el panorama completo",
    texto: "Ahí ves los últimos movimientos de todos tus módulos juntos (con espacio para anotar el sustento de cada uno) y el Kardex: el historial completo de entradas y salidas de cada producto de tu Stock.",
  },
  {
    titulo: "Un Excel desordenado no es problema",
    texto: "Si tu Excel tiene columnas raras, varias hojas o datos sueltos, súbelo igual: el asistente de carga te va a preguntar qué es cada cosa, y si está muy desordenado puedes pedirle a la IA que te sugiera cómo separarlo.",
  },
];

// Carrusel simple de tips para Inicio: flecha derecha avanza, izquierda retrocede
// (clickeando varias veces a la izquierda volvés al consejo inicial). Pista "riel"
// con overflow:hidden + translateX, nada de librerías para esto.
export default function ConsejosInicio() {
  const [indice, setIndice] = useState(0);

  return (
    <div className="tarjeta" style={{ marginBottom: 20, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>Consejos</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-fantasma"
            aria-label="Consejo anterior"
            onClick={() => setIndice((i) => Math.max(0, i - 1))}
            disabled={indice === 0}
            style={{ borderRadius: "50%", width: 36, height: 36, padding: 0, display: "grid", placeItems: "center" }}
          >
            ‹
          </button>
          <span className="suave pequeno">{indice + 1}/{CONSEJOS.length}</span>
          <button
            type="button"
            className="btn btn-fantasma"
            aria-label="Siguiente consejo"
            onClick={() => setIndice((i) => Math.min(CONSEJOS.length - 1, i + 1))}
            disabled={indice === CONSEJOS.length - 1}
            style={{ borderRadius: "50%", width: 36, height: 36, padding: 0, display: "grid", placeItems: "center" }}
          >
            ›
          </button>
        </div>
      </div>

      <div style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            transform: `translateX(-${indice * 100}%)`,
            transition: "transform 0.3s ease",
          }}
        >
          {CONSEJOS.map((c) => (
            <div key={c.titulo} style={{ flex: "0 0 100%", minWidth: 0, paddingRight: 4 }}>
              <strong style={{ display: "block", marginBottom: 6 }}>{c.titulo}</strong>
              <p className="suave" style={{ margin: 0 }}>{c.texto}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
