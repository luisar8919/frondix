import Link from "next/link";
import Logo from "@/components/Logo";

// Borrador propio, sin revisión de un abogado todavía. Cubre lo esencial
// (responsabilidad del usuario por los datos que carga) mientras Frondix
// tiene pocos usuarios; antes de crecer conviene que un abogado peruano lo revise,
// sobre todo la parte de datos personales (Ley N° 29733).
export default function TerminosPage() {
  return (
    <>
      <header className="cabecera">
        <div className="contenedor cabecera-fila"><Logo /></div>
      </header>
      <main className="contenedor" style={{ maxWidth: 720, padding: "40px 16px 80px" }}>
        <h1>Términos de servicio</h1>
        <p className="suave">Última actualización: 30 de setiembre de 2026.</p>

        <h2>1. Qué es Frondix</h2>
        <p>
          Frondix es una herramienta para que organices en módulos de búsqueda los datos que tú mismo subes
          (normalmente desde un archivo Excel). Frondix almacena y muestra esa información tal como la subiste;
          no revisa, valida ni se hace responsable por el contenido de los datos que cargas.
        </p>

        <h2>2. Responsabilidad sobre los datos que subes</h2>
        <p>Al usar Frondix, declaras y aceptas que:</p>
        <ul>
          <li>Los datos que subes son tuyos o tienes autorización para tratarlos (por ejemplo, datos de tus propios clientes o de tu negocio).</li>
          <li>No subirás datos de terceros obtenidos sin autorización, datos sensibles que no correspondan a tu operación, ni contenido ilegal, difamatorio o que infrinja derechos de propiedad intelectual de otros.</li>
          <li>Si los datos incluyen información personal de terceros (clientes, proveedores, etc.), eres responsable de cumplir con la Ley N° 29733 (Ley de Protección de Datos Personales del Perú) y normas aplicables, incluyendo contar con las autorizaciones necesarias.</li>
          <li>Eres el único responsable frente a terceros y autoridades por el contenido y origen de los datos que subes a Frondix.</li>
        </ul>

        <h2>3. Liberación de responsabilidad</h2>
        <p>
          En la medida permitida por la ley, liberas a Frondix (LAR Productions) de cualquier reclamo, multa o daño
          que surja del uso indebido de la plataforma o de datos que hayas subido sin la autorización correspondiente.
          Frondix puede eliminar o suspender contenido o cuentas que incumplan estos términos o la ley, sin previo aviso.
        </p>

        <h2>4. Disponibilidad del servicio</h2>
        <p>
          Frondix se ofrece &quot;tal como está&quot;, sin garantía de disponibilidad continua. Hacemos lo posible por
          mantener tus datos seguros y disponibles, pero te recomendamos conservar tu Excel original como respaldo.
        </p>

        <h2>5. Contacto</h2>
        <p>
          Dudas sobre estos términos: escríbenos a{" "}
          <a href="mailto:luisar8919@gmail.com">luisar8919@gmail.com</a>.
        </p>

        <p style={{ marginTop: 32 }}>
          <Link href="/signup">Volver a crear cuenta</Link>
        </p>
      </main>
    </>
  );
}
