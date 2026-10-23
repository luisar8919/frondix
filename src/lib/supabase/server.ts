import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Cliente con la sesión del usuario logueado — respeta Row Level Security,
// nunca ve datos de otra empresa aunque el código tenga un bug.
//
// Dos formas de traer la sesión, para que los mismos Route Handlers sirvan
// tanto a la web (cookies) como a la app nativa de Android (Bearer token,
// sin cookies): si la request trae "Authorization: Bearer <token>" se arma
// un cliente con ese token; si no, se cae al flujo de cookies de siempre.
// headers() lee la request actual sin que haga falta pasarla a mano, así que
// esto no obliga a tocar ninguno de los ~60 Route Handlers que ya llaman a
// esta función sin argumentos.
export async function crearClienteServidor() {
  const auth = (await headers()).get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length);
    const cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } }
    );
    // Los Route Handlers llaman a supabase.auth.getUser() sin argumentos: sin
    // esto, el cliente no tiene ninguna sesión propia (persistSession:false,
    // recién creado) y getUser() devuelve usuario nulo aunque el token en el
    // header sea válido. refresh_token vacío porque la app nativa ya se
    // encarga de refrescar ANTES de llamar; si el access_token ya expiró,
    // esto falla y getUser() devuelve null -- correcto, el cliente reintenta
    // con un token fresco en vez de la API fallando en silencio.
    await cliente.auth.setSession({ access_token: token, refresh_token: "" });
    return cliente;
  }

  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // se llama también desde Server Components, donde no se puede
            // escribir cookies; el middleware se encarga de refrescar la sesión.
          }
        },
      },
    }
  );
}
