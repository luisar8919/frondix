import Logros from "@/components/Logros";

// "Resumen > Hitos" -- antes vivía arriba de todo en Inicio.
export default function LogrosPage() {
  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Hitos de tu negocio</h1>
          <p className="suave">Cada uno de estos es una función real de Frondix -- vas probando a tu ritmo.</p>
        </div>
      </div>
      <Logros />
    </>
  );
}
