import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px 64px", lineHeight: 1.5 }}>
      <header style={{ marginBottom: 40 }}>
        <strong style={{ fontSize: 22 }}>Frondix</strong>
        <span style={{ color: "#666", marginLeft: 12 }}>Cultivá tu cartera de clientes.</span>
      </header>

      <h1 style={{ fontSize: 32, marginBottom: 8 }}>
        ¿Alguna vez perdiste una venta, un cliente, o datos importantes por culpa de tu Excel?
      </h1>
      <p style={{ color: "#666" }}>
        Si nunca te pasó, tu Excel está bien como está — no necesitás esto.
        Si te pasó (o sabés que en cualquier momento pasa), seguí leyendo.
      </p>

      <section style={{ marginTop: 40 }}>
        <p>Tu Excel funciona perfecto hasta el día que:</p>
        <ul>
          <li>Alguien más tiene que cargar datos y no sabés cómo evitar que te rompa una hoja.</li>
          <li>Se te pasó hacerle seguimiento a un cliente porque nadie te avisó a tiempo.</li>
          <li>Se te rompió la laptop, o alguien pisó el archivo, y perdiste meses de información.</li>
          <li>Ya no encontrás nada de tan grande que se puso.</li>
        </ul>
        <p>
          Eso es lo que resolvemos. No un CRM con mil botones — tu mismo Excel, pero que no se
          rompe, te avisa por WhatsApp, y cada persona ve solo lo que tiene que ver.
        </p>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 20 }}>Cómo funciona</h2>
        <p>Subís tu Excel. En 2 minutos tenés una tabla y un formulario de carga andando — sin curso, sin configurar nada.</p>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 20 }}>Precio</h2>
        <p>S/35/mes. Pagás con Yape. Sin tarjeta, sin contrato, sin hablar con un vendedor.</p>
      </section>

      <p style={{ marginTop: 48 }}>
        <Link href="/signup"><strong>Probá Frondix con tu propio Excel</strong></Link> ·{" "}
        <Link href="/login">Ya tengo cuenta</Link>
      </p>
    </main>
  );
}
