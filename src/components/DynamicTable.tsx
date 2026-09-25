import type { Columna } from "@/lib/excel-parser";

export default function DynamicTable({
  columnas,
  registros,
}: {
  columnas: Columna[];
  registros: { id: string; data: Record<string, unknown> }[];
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {columnas.map((c) => (
            <th key={c.key} style={{ textAlign: "left", borderBottom: "2px solid #ddd", padding: 8 }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {registros.map((r) => (
          <tr key={r.id}>
            {columnas.map((c) => (
              <td key={c.key} style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                {String(r.data[c.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
