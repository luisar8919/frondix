import { crearClienteBrowser } from "./supabase/client";
import { empresaDelUsuario } from "./sesion";

// Para los botones que disparan una acción que no deja rastro propio en la
// base (exportar un reporte, ver src/lib/logros.ts) -- fire and forget, nunca
// debe interrumpir la descarga/impresión si falla.
export async function marcarLogroCliente(clave: string) {
  try {
    const supabase = crearClienteBrowser();
    const sesion = await empresaDelUsuario(supabase);
    if (!sesion.ok) return;
    await fetch("/api/logros/marcar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresaId: sesion.empresaId, clave }),
    });
  } catch {
    // silencioso a propósito
  }
}
