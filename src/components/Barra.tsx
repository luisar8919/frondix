// Una barra hecha con CSS (sin librería de gráficos): un div cuyo ancho es el
// porcentaje del máximo del grupo. Simple y ligero, acorde al resto del panel.
export default function Barra({ valor, maximo, etiqueta, texto }: { valor: number; maximo: number; etiqueta: string; texto: string }) {
  const porcentaje = maximo > 0 ? Math.max(4, Math.round((valor / maximo) * 100)) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span className="suave pequeno">{etiqueta}</span>
      <div style={{ background: "var(--verde-100)", borderRadius: 4, height: 20 }}>
        <div style={{ width: `${porcentaje}%`, background: "var(--verde-600)", height: "100%", borderRadius: 4 }} />
      </div>
      <span className="pequeno" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{texto}</span>
    </div>
  );
}
