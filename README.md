# Frondix

Cultivá tu cartera de clientes. Subís un Excel, se genera automáticamente una tabla + formulario de carga (Postgres),
con accesos por empresa, cobro por Culqi (tarjeta recurrente / Yape manual) y
recordatorios por WhatsApp Cloud API.

## Stack (todo capa gratis para arrancar)

- **Next.js** (App Router) — frontend + backend en un solo proyecto, hosteado gratis en Vercel.
- **Supabase** — Postgres + Auth + Row Level Security, plan gratis hasta 500MB.
- **Culqi** — pasarela de pago peruana (tarjeta con suscripción automática, Yape como cargo manual).
- **WhatsApp Cloud API** (Meta, directo, sin intermediario) — mensajes y recordatorios.

## Puesta en marcha

1. **Supabase**: creá un proyecto en supabase.com, andá a SQL Editor y corré [`supabase/schema.sql`](supabase/schema.sql) completo.
   En Authentication > Providers, para desarrollo podés desactivar "Confirm email" así el signup no requiere click en un mail.

2. **Variables de entorno**: copiá `.env.example` a `.env.local` y completá:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — en Supabase > Settings > API.
   - `NEXT_PUBLIC_CULQI_PUBLIC_KEY` / `CULQI_SECRET_KEY` — en culqi.com, llaves de prueba primero.
   - `CULQI_PLAN_ID` — creá un plan en Culqi Dashboard > Suscripciones > Planes (monto, moneda PEN, frecuencia mensual) y copiá su id.
   - `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` — en developers.facebook.com, tu app > WhatsApp > API Setup.
   - `WHATSAPP_VERIFY_TOKEN` — cualquier string secreto que vos inventes, se usa solo para que Meta confirme el webhook.

3. **Instalar y correr**:
   ```
   npm install
   npm run dev
   ```
   Abrí http://localhost:3000

4. **Probar el parser del Excel de forma aislada** (sin levantar el server):
   ```
   npm run test:parser
   ```

## Cómo está organizado

- `src/lib/excel-parser.ts` — la pieza más importante: lee el Excel, infiere columnas y tipos. Todo lo demás depende de que esto funcione bien con Excels reales y desprolijos.
- `supabase/schema.sql` — el modelo de datos completo, con seguridad por fila (RLS): cada empresa solo ve sus propios datasets/records, ya resuelto a nivel de base de datos, no en el código de la app.
- `src/app/api/*` — toda la lógica de servidor (subir Excel, leer/crear registros, invitar miembros, cobrar, mandar WhatsApp).
- `src/app/dashboard/*` — la interfaz: lista de tablas, subida de Excel, tabla+formulario dinámico, equipo, facturación.
- `scripts/enviar-resumen-semanal.mjs` — pensado para correr 1 vez por semana (cron) y mandar el resumen por WhatsApp a cada dueño de empresa.

## Pendiente antes de cobrar plata real

- [ ] Sacar RUC como persona natural con negocio (SUNAT, online) y afiliarte a Culqi con llaves de producción.
- [ ] Crear y aprobar la plantilla de WhatsApp `resumen_semanal` en Meta Business Manager (sin plantilla aprobada, el script de recordatorio no puede mandar mensajes fuera de la ventana de 24hs).
- [ ] Guardar el teléfono del usuario en su perfil (`auth.users.phone` o una columna aparte) — el script de resumen semanal lo necesita y hoy no hay ninguna pantalla que lo pida.
- [ ] Definir qué pasa si `estado` de la suscripción no es `activa` (hoy no hay ningún bloqueo real en la app para empresas sin pagar).
- [ ] Subir el archivo Excel original a Supabase Storage como respaldo (hoy se parsea y se descarta).
