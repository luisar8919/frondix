// Envío de notificaciones push (Firebase Cloud Messaging) a la app móvil.
// Las credenciales (cuenta de servicio) NUNCA van al repo -- viven solo en
// FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY (.env.local
// en desarrollo, variables de entorno de Azure en producción).
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { SupabaseClient } from "@supabase/supabase-js";

function appFirebase() {
  const existentes = getApps();
  if (existentes.length > 0) return existentes[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // La clave privada viaja con \n literales (así la exporta Firebase) -- hay
  // que convertirlos a saltos de línea reales antes de usarla.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Falta configurar FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY");
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

// Manda la misma notificación a todos los tokens de un usuario (puede tener
// varios: celular nuevo, reinstaló la app). Si un token ya no sirve (la app
// se desinstaló, por ejemplo), Firebase lo rechaza -- se borra de la tabla
// para no seguir intentando en cada corrida.
export async function enviarPush(
  supabaseAdmin: SupabaseClient,
  userIds: string[],
  titulo: string,
  cuerpo: string,
  datos?: Record<string, string>
): Promise<void> {
  if (userIds.length === 0) return;
  const { data: tokens } = await supabaseAdmin.from("push_tokens").select("id, token").in("user_id", userIds);
  if (!tokens || tokens.length === 0) return;

  const app = appFirebase();
  const mensajeria = getMessaging(app);

  for (const t of tokens) {
    try {
      await mensajeria.send({ token: t.token, notification: { title: titulo, body: cuerpo }, data: datos });
    } catch (e) {
      const codigo = (e as { errorInfo?: { code?: string } })?.errorInfo?.code;
      if (codigo === "messaging/registration-token-not-registered" || codigo === "messaging/invalid-argument") {
        await supabaseAdmin.from("push_tokens").delete().eq("id", t.id);
      }
      // cualquier otro error: no bloquea el resto de los envíos
    }
  }
}
