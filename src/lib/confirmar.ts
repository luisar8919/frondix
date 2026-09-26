// Llama a la API; si responde 409 con `advertencias`, le pide confirmación al usuario y reintenta
// con `confirmar: true`. `cancelado` = el usuario dijo que no.
export async function enviarConfirmando(
  url: string,
  metodo: "PATCH" | "PUT" | "DELETE",
  cuerpo: Record<string, unknown> = {}
): Promise<{ ok: boolean; cancelado?: boolean; body: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const llamar = async (extra: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cuerpo, ...extra }),
    });
    return { res, body: await res.json().catch(() => ({})) };
  };

  let { res, body } = await llamar({});
  if (res.status === 409 && Array.isArray(body.advertencias)) {
    const texto = "⚠ Atención\n\n" + body.advertencias.join("\n\n") + "\n\n¿Quieres continuar?";
    if (!window.confirm(texto)) return { ok: false, cancelado: true, body };
    ({ res, body } = await llamar({ confirmar: true }));
  }
  return { ok: res.ok, body };
}
