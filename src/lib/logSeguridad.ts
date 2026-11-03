// Log mínimo de eventos de seguridad/alto impacto (borrado de cuenta, transferencia
// de empresa, acceso al panel interno): hoy no hay ninguno, así que un incidente no
// se puede reconstruir después. Va a la consola del servidor (Azure recoge stdout de
// las Functions) -- sin tabla ni servicio nuevo, lo mínimo que deja rastro real.
// Prefijo "SEGURIDAD ::" para poder filtrarlo igual que "DIAG ::" en el otro proyecto.
export function logEventoSeguridad(evento: string, detalle: Record<string, unknown>) {
  console.log(`SEGURIDAD :: ${evento} :: ${JSON.stringify({ ts: new Date().toISOString(), ...detalle })}`);
}
