import Link from "next/link";
import Logo from "@/components/Logo";

// Borrador propio, sin revisión de un abogado todavía (mismo criterio que
// /terminos) -- Frondix es una suscripción de software, no un bien físico,
// así que "cambios" en el sentido de una tienda no aplica; esto cubre
// cancelación y reembolsos, que es lo que sí corresponde a este negocio.
export default function PoliticaCambiosPage() {
  return (
    <>
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="contenedor" style={{ maxWidth: 720, padding: "40px 16px 80px" }}>
        <h1>Política de cancelación y devoluciones</h1>
        <p className="suave">Última actualización: 24 de noviembre de 2026.</p>

        <p>
          Frondix es un servicio de suscripción (software), no un producto físico, así que no hay &quot;cambios&quot;
          en el sentido de una tienda. Esto explica cómo funcionan la cancelación y los reembolsos.
        </p>

        <h2>1. Cancelar tu plan</h2>
        <p>
          Puedes cancelar tu plan pagado cuando quieras desde Mi Cuenta &gt; Plan y pagos, o escribiendo a{" "}
          <a href="mailto:luisar8919@gmail.com">luisar8919@gmail.com</a>. Al cancelar, sigues teniendo acceso al
          plan pagado hasta el final del ciclo que ya pagaste (mensual o anual); después, tu cuenta pasa al plan
          gratuito sin perder tus datos.
        </p>

        <h2>2. Reembolsos</h2>
        <p>
          No hacemos reembolsos por el tiempo restante de un ciclo ya pagado (mensual o anual) cuando la
          cancelación la pide el usuario. Si el cobro fue un error nuestro (ej. un cobro duplicado, un monto
          incorrecto, o seguimos cobrando después de que cancelaste a tiempo), te lo devolvemos completo:
          escríbenos y lo revisamos.
        </p>

        <h2>3. Comprobantes de facturación electrónica</h2>
        <p>
          Si tu plan incluye facturación electrónica real ante SUNAT (ver Precios en la página principal), los
          comprobantes ya emitidos a tus propios clientes no se pueden anular por una cancelación de tu plan de
          Frondix -- eso se maneja aparte, con una nota de crédito, igual que cualquier factura electrónica.
        </p>

        <h2>4. Contacto</h2>
        <p>
          Dudas sobre esta política: escríbenos a <a href="mailto:luisar8919@gmail.com">luisar8919@gmail.com</a>, o
          usa el{" "}
          <Link href="/libro-reclamaciones">Libro de Reclamaciones</Link>.
        </p>

        <p style={{ marginTop: 32 }}>
          <Link href="/">Volver al inicio</Link>
        </p>
      </main>
    </>
  );
}
