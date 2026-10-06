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
        <p className="suave">Última actualización: 1 de octubre de 2026.</p>

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

        <h2>4. Acceso a tus datos</h2>
        <p>
          Tus datos están encriptados en reposo (estándar de Supabase/Postgres, protege contra el robo físico de la
          base de datos), y cada empresa solo puede ver y editar su propia información dentro de la aplicación
          (reglas de acceso por fila a nivel de base de datos). Dicho esto, preferimos ser directos en vez de prometer
          algo que no es real: Frondix no ofrece encriptación de extremo a extremo, así que el equipo que opera la
          plataforma (hoy, su fundador) tiene la capacidad técnica de acceder a los datos almacenados.
        </p>
        <p>
          Esto no es un descuido: funciones como el buscador, los reportes, el seguimiento de clientes por WhatsApp y
          la sugerencia de columnas con IA necesitan que el servidor pueda leer tu información para funcionar. Una
          encriptación donde ni el servidor pudiera leer nada eliminaría esas funciones. Por eso, en vez de prometer
          un acceso cero que no podríamos sostener, nos comprometemos a: no acceder a tus datos salvo para dar soporte
          cuando lo pidas, diagnosticar un problema técnico, o cuando la ley lo exija; no venderlos ni compartirlos con
          terceros para publicidad; y eliminarlos si cierras tu cuenta y lo solicitas.
        </p>

        <h2>5. Highlights generados con inteligencia artificial</h2>
        <p>
          Si tu plan incluye &quot;Lo más importante, en palabras&quot; (en Reportes), parte de la información de tus
          módulos se envía a un proveedor externo de inteligencia artificial (Gemini, de Google) para generar ese
          resumen. Concretamente, se envían: los totales y rankings que ya ves en Reportes, y los últimos 50
          registros de cada módulo con el nombre y el teléfono de tus clientes quitados antes del envío —
          el resto de columnas (por ejemplo producto, monto, fecha, u otras que tu Excel traiga) sí viaja.
        </p>
        <p>
          Esto implica una transferencia de datos a un servidor fuera del Perú, sujeta a los términos y la política
          de privacidad de Google. Si prefieres que tus datos nunca salgan de Frondix, no actives o no uses esta
          función (puede desactivarse a pedido escribiéndonos a soporte).
        </p>

        <h2>6. Disponibilidad del servicio</h2>
        <p>
          Frondix se ofrece &quot;tal como está&quot;, sin garantía de disponibilidad continua. Hacemos lo posible por
          mantener tus datos seguros y disponibles, pero te recomendamos conservar tu Excel original como respaldo.
        </p>

        <h2>7. Contacto</h2>
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
