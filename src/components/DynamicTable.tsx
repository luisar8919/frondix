import type { Columna } from "@/lib/excel-parser";

export default function DynamicTable({
  columnas,
  registros,
}: {
  columnas: Columna[];
  registros: { id: string; data: Record<string, unknown> }[];
}) {
  if (registros.length === 0) {
    return <div className="tarjeta vacio">No hay registros que coincidan.</div>;
  }

  return (
    <div className="tabla-envoltura" tabIndex={0} role="region" aria-label="Tabla de datos">
      <table>
        <thead>
          <tr>
            {columnas.map((c) => (
              <th key={c.key} className={c.tipo === "numero" ? "num" : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id}>
              {columnas.map((c) => (
                <td key={c.key} className={c.tipo === "numero" ? "num" : undefined}>
                  {c.tipo === "fecha" && r.data[c.key]
                    ? String(r.data[c.key]).slice(0, 10)
                    : String(r.data[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
