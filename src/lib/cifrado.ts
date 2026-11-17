import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Cifrado simétrico (AES-256-GCM) para datos sensibles que SÍ necesitan
// volver a leerse en texto plano del lado del servidor (a diferencia de una
// contraseña de usuario, que se hashea y nunca se recupera) -- hoy solo lo
// usa la contraseña SMTP propia de cada empresa (ver migracion-35). Clave
// fija en SMTP_ENCRYPTION_KEY (32 bytes, ej. `openssl rand -base64 32`),
// NUNCA en el repo. Formato guardado: "iv:tag:cifrado", todo en base64.
function clave(): Buffer {
  const k = process.env.SMTP_ENCRYPTION_KEY;
  if (!k) throw new Error("Falta configurar SMTP_ENCRYPTION_KEY");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("SMTP_ENCRYPTION_KEY debe ser 32 bytes en base64");
  return buf;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", clave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${cifrado.toString("base64")}`;
}

export function descifrar(valor: string): string {
  const [ivB64, tagB64, dataB64] = valor.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Valor cifrado con formato inválido");
  const decipher = createDecipheriv("aes-256-gcm", clave(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const texto = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return texto.toString("utf8");
}
