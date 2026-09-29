// Limite simple para endpoints publicos (webhooks) sin sesion que los proteja.
// ponytail: vive en memoria por instancia del servidor, no es exacto entre varias
// instancias de Azure ni sobrevive un reinicio — para estos endpoints (avisos que casi
// nunca llegan más de una vez por segundo) alcanza para frenar un abuso obvio sin
// meter una tabla nueva en la base. Si algún día hace falta algo exacto, pasar esto
// a una tabla en Supabase como se hizo con ia_llamadas.
const peticiones = new Map<string, number[]>();

export function limitePorIp(ip: string, maxPorMinuto: number): boolean {
  const ahora = Date.now();
  const haceUnMinuto = ahora - 60000;
  const previas = (peticiones.get(ip) ?? []).filter((t) => t > haceUnMinuto);
  if (previas.length >= maxPorMinuto) return false;
  previas.push(ahora);
  peticiones.set(ip, previas);
  return true;
}

export function ipDePeticion(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0].trim() || "desconocida";
}
