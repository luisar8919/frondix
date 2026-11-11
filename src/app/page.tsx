import Link from "next/link";
import Logo from "@/components/Logo";
import CalculadoraAhorro from "@/components/CalculadoraAhorro";

// Piloto gratis por WhatsApp directo con el fundador (ver campaña "Primeros 10 talleres").
const WHATSAPP_FUNDADOR = "998235775";
const enlaceWhatsappFundador = `https://wa.me/51${WHATSAPP_FUNDADOR}?text=${encodeURIComponent(
  "Hola, vi Frondix y quiero probarlo gratis con mi propio Excel."
)}`;

const dolores = [
  { titulo: "Alguien más carga datos", texto: "y no sabes cómo evitar que te rompa una hoja o borre lo que ya estaba." },
  { titulo: "Se te pasó un seguimiento", texto: "porque nadie te avisó a tiempo de volver a escribirle a ese cliente." },
  { titulo: "Se rompió el archivo", texto: "la laptop falló o alguien lo sobrescribió, y meses de información desaparecieron." },
  { titulo: "Ya no encuentras nada", texto: "el Excel creció tanto que buscar un dato es recorrer la hoja sin fin." },
];

// Posicionamiento explícito frente a la objeción más común ("¿y la
// facturación?"): Frondix no es un POS ni un facturador -- es el ERP liviano
// que ordena lo que esos sistemas no muestran (stock, ventas, ganancia real),
// a propósito sin meterse en la parte fiscal. Dos públicos, cada uno con su
// propio motivo para no necesitar esa capa aquí.
const publicos = [
  { icono: "🛍️", titulo: "¿Todavía no facturas cada venta?", texto: "Si tu negocio es informal o semi-formal, Frondix es tu sistema completo: ventas, compras, stock y clientes ordenados, sin obligarte a facturar lo que hoy no facturas." },
  { icono: "🤝", titulo: "¿Ya facturas en otro sistema?", texto: "Frondix se monta al lado del que ya usas para facturar: tú sigues emitiendo tus comprobantes ahí, y acá tienes la visibilidad real de tu negocio que ese sistema no te da. Si necesitas los datos para SUNAT, te los dejamos listos para copiar." },
];

const pasos = [
  { titulo: "Sube tu Excel", texto: "El que ya usas, aunque esté desordenado. Si tiene varias hojas, las ordenamos por ti." },
  { titulo: "Revisa las columnas", texto: "Confirmas qué es cada dato: producto, cliente, monto, fecha. Toma un minuto." },
  { titulo: "Carga y busca", texto: "Tienes tu módulo, un formulario para agregar registros y un buscador. Sin configurar nada." },
];

// Lo que diferencia a Frondix de "armar un Excel más bonito" -- estructuración
// automática primero (el punto fuerte real: ningún otro sistema arma el
// módulo solo a partir de un Excel desordenado), seguido de lo que ya
// funciona hoy en el producto y es vendible: stock que se ajusta solo,
// reportes listos para decidir, datos para SUNAT, multi-moneda y celular.
const diferenciadores = [
  { icono: "🧩", titulo: "Se estructura solo", texto: "Subes tu Excel desordenado y Frondix detecta qué es cada columna (producto, cliente, monto, fecha) y arma el módulo. No hay plantillas que llenar ni campos que inventar." },
  { icono: "📦", titulo: "Stock que se ajusta solo", texto: "Cada venta o compra suma o descuenta stock automáticamente, con alertas cuando un producto está por acabarse." },
  { icono: "📊", titulo: "Visibilidad para decidir", texto: "Ganancia neta, productos más vendidos y flujo de caja, actualizados solos cada vez que registras algo." },
  { icono: "🧾", titulo: "Listo para tu facturación", texto: "Exporta tus ventas y compras con los datos que pide SUNAT (valor de venta, IGV, total) para registrar tus comprobantes donde ya facturas." },
  { icono: "🌎", titulo: "Para toda Latinoamérica", texto: "Soles, dólares, pesos mexicanos, colombianos, chilenos, argentinos, reales o euros: cada módulo con su propia moneda." },
  { icono: "📱", titulo: "Pensado para el celular", texto: "Tablas legibles desde el teléfono, no solo desde la computadora de la oficina." },
];

export default function Portada() {
  return (
    <>
      <header className="cabecera">
        <div className="contenedor cabecera-fila">
          <Logo />
          <nav className="acciones" aria-label="Principal">
            <Link href="/login" className="btn btn-fantasma">Ingresar</Link>
            <Link href="/signup" className="btn btn-primario">Probar gratis</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="contenedor hero">
          <div>
            <span className="eyebrow">Para negocios que llevan todo en Excel</span>
            <h1>¿Alguna vez perdiste una venta, un cliente o datos por culpa de tu Excel?</h1>
            <p className="entrada">
              Si nunca te pasó, tu Excel está bien como está. Si te pasó, Frondix convierte esa misma hoja de cálculo
              en una herramienta que no se rompe, donde cada persona ve solo lo que le corresponde.
            </p>
            <div className="hero-cta">
              <Link href="/signup" className="btn btn-primario btn-grande">Pruébalo con tu propio Excel</Link>
              <a href={enlaceWhatsappFundador} target="_blank" rel="noopener noreferrer" className="btn btn-secundario btn-grande">
                Pide tu piloto gratis por WhatsApp
              </a>
            </div>
            <p className="ayuda" style={{ marginTop: 14 }}>Gratis para empezar. Sin tarjeta.</p>
          </div>

          <div className="tarjeta tarjeta-elevada maqueta" aria-hidden="true">
            <div className="maqueta-barra"><span /><span /><span /></div>
            <div className="maqueta-cuerpo">
              <div className="maqueta-buscar"><span>Buscar: ana</span><span className="insignia">1 de 5</span></div>
              <table>
                <thead>
                  <tr><th>Cliente</th><th>Servicio</th><th className="num">Monto</th></tr>
                </thead>
                <tbody>
                  <tr><td>Ana Torres</td><td>Cambio de aceite</td><td className="num">S/ 120</td></tr>
                  <tr><td>Luis Ramírez</td><td>Alineamiento</td><td className="num">S/ 80</td></tr>
                  <tr><td>Carla Quispe</td><td>Filtro de aire</td><td className="num">S/ 45</td></tr>
                  <tr><td>Marta Díaz</td><td>Batería</td><td className="num">S/ 380</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="seccion contenedor">
          <div className="seccion-titulo">
            <span className="eyebrow">El problema</span>
            <h2>Tu Excel funciona perfecto, hasta el día que…</h2>
            <p>Si alguna de estas te suena, esto es para ti.</p>
          </div>
          <div className="grilla-4">
            {dolores.map((d) => (
              <div key={d.titulo} className="tarjeta dolor">
                <h3>{d.titulo}</h3>
                <p>{d.texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="seccion seccion-suave">
          <div className="contenedor">
            <div className="seccion-titulo seccion-titulo-centrado">
              <span className="eyebrow">Lo que te está costando</span>
              <h2>¿Cuánto te cuesta ordenar tu Excel hoy?</h2>
              <p>Compara con lo que le pagarías a alguien para hacerlo a mano.</p>
            </div>
            <CalculadoraAhorro />
          </div>
        </section>

        <section id="como-funciona" className="seccion contenedor">
          <div className="seccion-titulo">
            <span className="eyebrow">La solución</span>
            <h2>De tu Excel a tus módulos en pocos minutos</h2>
            <p>Sin cursos, sin instalar nada y sin cambiar tu forma de trabajar.</p>
          </div>
          <div className="grilla-3">
            {pasos.map((p, i) => (
              <div key={p.titulo} className="tarjeta">
                <span className="paso-num">{i + 1}</span>
                <h3>{p.titulo}</h3>
                <p className="suave" style={{ margin: 0 }}>{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="seccion contenedor">
          <div className="seccion-titulo seccion-titulo-centrado">
            <span className="eyebrow">Por qué Frondix</span>
            <h2>Tú no estructuras nada. Nosotros sí.</h2>
            <p>Ningún otro sistema arma tus módulos solo a partir de tu Excel desordenado. Esto es lo que ganas apenas lo subes.</p>
          </div>
          <div className="grilla-3">
            {diferenciadores.map((d) => (
              <div key={d.titulo} className="tarjeta">
                <span aria-hidden="true" style={{ fontSize: 28, display: "block", marginBottom: 10 }}>{d.icono}</span>
                <h3>{d.titulo}</h3>
                <p className="suave" style={{ margin: 0 }}>{d.texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="seccion contenedor">
          <div className="seccion-titulo seccion-titulo-centrado">
            <span className="eyebrow">Sin rodeos</span>
            <h2>Frondix no factura. Y es a propósito.</h2>
            <p>
              No competimos contra tu facturador ni contra un POS completo. Ordenamos lo que ninguno de los dos te
              muestra: tu stock, tus ventas y tu ganancia real, listos en minutos desde tu propio Excel.
            </p>
          </div>
          <div className="grilla-2">
            {publicos.map((d) => (
              <div key={d.titulo} className="tarjeta">
                <span aria-hidden="true" style={{ fontSize: 28, display: "block", marginBottom: 10 }}>{d.icono}</span>
                <h3>{d.titulo}</h3>
                <p className="suave" style={{ margin: 0 }}>{d.texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="precios" className="seccion seccion-suave">
          <div className="contenedor">
            <div className="seccion-titulo">
              <span className="eyebrow">Sin letra pequeña</span>
              <h2>Empieza gratis, crece cuando lo necesites</h2>
              <p>Frondix ya funciona gratis para cargar tu Excel y ordenarlo. Pagar no es para empezar, es para cuando quieras subir de nivel la gestión.</p>
            </div>
            <div className="precios precios-3">
              <div className="tarjeta precio">
                <h3>Gratis</h3>
                <div className="precio-monto">S/ 0</div>
                <p className="suave pequeno">Para ordenar tus datos tú solo.</p>
                <ul>
                  <li>Un usuario</li>
                  <li>Todos los módulos que quieras</li>
                  <li>Formulario de carga y buscador</li>
                  <li>Stock que se ajusta solo, con alertas</li>
                </ul>
                <Link href="/signup" className="btn btn-secundario btn-bloque">Crear cuenta gratis</Link>
              </div>
              <div className="tarjeta precio precio-destacado">
                <h3>Mensual <span className="insignia" style={{ marginLeft: 6 }}>Recomendado</span></h3>
                <div className="precio-monto">S/ 30<small> /mes</small></div>
                <p className="suave pequeno">Para trabajar en equipo. Equivalente en tu moneda.</p>
                <p className="pequeno" style={{ fontWeight: 700, color: "var(--verde-700)", margin: "2px 0 0" }}>
                  Primer mes gratis. No pedimos tarjeta.
                </p>
                <ul>
                  <li>Todo lo del plan gratis</li>
                  <li>Invita a tu equipo con accesos por rol</li>
                  <li>
                    Seguimiento de clientes por WhatsApp: te avisamos a quién escribirle y el mensaje sale listo <span className="insignia insignia-sol">Envío automático: próximamente</span>
                  </li>
                </ul>
                <Link href="/signup" className="btn btn-primario btn-bloque">Empezar ahora</Link>
              </div>
              <div className="tarjeta precio">
                <h3>Anual</h3>
                <div className="precio-monto">S/ 300<small> /año</small></div>
                <p className="suave pequeno">Lo mismo que el plan mensual, pagando una vez al año.</p>
                <p className="pequeno" style={{ fontWeight: 700, color: "var(--verde-700)", margin: "2px 0 0" }}>
                  Ahorras S/ 60 al año (2 meses gratis).
                </p>
                <ul>
                  <li>Todo lo del plan mensual</li>
                  <li>Un solo cobro al año, sin recordatorios</li>
                </ul>
                <Link href="/signup" className="btn btn-secundario btn-bloque">Empezar ahora</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="contenedor" style={{ paddingBottom: 56 }}>
          <div className="banda-cta">
            <h2>Cultiva tu cartera de clientes</h2>
            <p>Sube tu Excel y mira cómo queda. Toma menos de lo que tarda en enfriarse un café.</p>
            <Link href="/signup" className="btn btn-claro btn-grande">Probar Frondix gratis</Link>
          </div>
        </section>
      </main>

      <footer className="pie">
        <div className="contenedor pie-fila">
          <Logo />
          <span>Cultiva tu cartera de clientes.</span>
        </div>
      </footer>
    </>
  );
}
