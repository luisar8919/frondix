import AlertasStock from "@/components/AlertasStock";

// "Seguimiento > Alertas" -- antes vivía dentro de Inventario (ahora Módulos >
// Stock > Reporte, ver InventarioResumen.tsx), separado porque es más una
// alerta operativa del día a día que un reporte de inventario.
export default function AlertasPage() {
  return (
    <>
      <div className="panel-cabecera">
        <div>
          <h1>Alertas de stock</h1>
          <p className="suave">Productos por debajo del mínimo que marcaste en cada módulo de Stock.</p>
        </div>
      </div>
      <AlertasStock />
    </>
  );
}
