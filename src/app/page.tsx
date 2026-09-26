import Link from "next/link";
import Logo from "@/components/Logo";

const dolores = [
  { titulo: "Alguien más carga datos", texto: "y no sabes cómo evitar que te rompa una hoja o borre lo que ya estaba." },
  { titulo: "Se te pasó un seguimiento", texto: "porque nadie te avisó a tiempo de volver a escribirle a ese cliente." },
  { titulo: "Se rompió el archivo", texto: "la laptop falló o alguien lo sobrescribió, y meses de información desaparecieron." },
  { titulo: "Ya no encuentras nada", texto: "el Excel creció tanto que buscar un dato es recorrer la hoja sin fin." },
];

const pasos = [
  { titulo: "Sube tu Excel", texto: "El que ya usas, aunque esté desordenado. Si tiene varias hojas, las ordenamos por ti." },
  { titulo: "Revisa las columnas", texto: "Confirmas qué es cada dato: producto, cliente, monto, fecha. Toma un minuto." },
  { titulo: "Carga y busca", texto: "Tienes tu tabla, un formulario para agregar registros y un buscador. Sin configurar nada." },
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
              <a href="#como-funciona" className="btn btn-secundario btn-grande">Cómo funciona</a>
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

        <section id="como-funciona" className="seccion seccion-suave">
          <div className="contenedor">
            <div className="seccion-titulo">
              <h2>De tu Excel a tu tabla en pocos minutos</h2>
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
          </div>
        </section>

        <section id="precios" className="seccion contenedor">
          <div className="seccion-titulo">
            <h2>Empieza gratis, crece cuando lo necesites</h2>
            <p>Sin contrato ni letra pequeña.</p>
          </div>
          <div className="precios">
            <div className="tarjeta precio">
              <h3>Gratis</h3>
              <div className="precio-monto">S/ 0</div>
              <p className="suave pequeno">Para ordenar tus datos tú solo.</p>
              <ul>
                <li>Un usuario</li>
                <li>Todas las tablas que quieras</li>
                <li>Formulario de carga y buscador</li>
              </ul>
              <Link href="/signup" className="btn btn-secundario btn-bloque">Crear cuenta gratis</Link>
            </div>
            <div className="tarjeta precio precio-destacado">
              <h3>Completo <span className="insignia" style={{ marginLeft: 6 }}>Recomendado</span></h3>
              <div className="precio-monto">S/ 35<small> /mes</small></div>
              <p className="suave pequeno">Para trabajar en equipo.</p>
              <ul>
                <li>Todo lo del plan gratis</li>
                <li>Invita a tu equipo con accesos por rol</li>
                <li>
                  Avisos y recordatorios por WhatsApp <span className="insignia insignia-sol">Próximamente</span>
                </li>
              </ul>
              <Link href="/signup" className="btn btn-primario btn-bloque">Empezar ahora</Link>
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
