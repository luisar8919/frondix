# Frondix

Cultiva tu cartera de clientes. Subes un Excel, se genera automáticamente una tabla + formulario de carga (Postgres),
con accesos por empresa, cobro por Culqi (tarjeta recurrente / Yape manual) y
recordatorios por WhatsApp Cloud API.

## Stack (todo capa gratis para arrancar)

- **Next.js** (App Router) — frontend + backend en un solo proyecto, alojado gratis en Vercel.
- **Supabase** — Postgres + Auth + Row Level Security, plan gratis hasta 500MB.
- **Culqi** — pasarela de pago peruana (tarjeta con suscripción automática, Yape como cargo manual).
- **WhatsApp Cloud API** (Meta, directo, sin intermediario) — mensajes y recordatorios.

## Puesta en marcha

1. **Supabase**: crea un proyecto en supabase.com, ve a SQL Editor y ejecuta [`supabase/schema.sql`](supabase/schema.sql) completo.
   En Authentication > Providers, para desarrollo puedes desactivar "Confirm email" para que el registro no requiera hacer clic en un correo.
   Si tu base ya tenía el esquema anterior, ejecuta en orden [`migracion-01-arreglar-rls.sql`](supabase/migracion-01-arreglar-rls.sql) y [`migracion-02-enlaces-y-capacidad.sql`](supabase/migracion-02-enlaces-y-capacidad.sql) (no borran datos).

2. **Variables de entorno**: copia `.env.example` a `.env.local` y completa:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — en Supabase > Settings > API.
   - `NEXT_PUBLIC_CULQI_PUBLIC_KEY` / `CULQI_SECRET_KEY` — en culqi.com, llaves de prueba primero.
   - `CULQI_PLAN_ID` — crea un plan en Culqi Dashboard > Suscripciones > Planes (monto, moneda PEN, frecuencia mensual) y copia su id.
   - `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` — en developers.facebook.com, tu app > WhatsApp > API Setup.
   - `WHATSAPP_VERIFY_TOKEN` — cualquier texto secreto que tú inventes, se usa solo para que Meta confirme el webhook.

3. **Instalar y correr**:
   ```
   npm install
   npm run dev
   ```
   Abre http://localhost:3000

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

## Capacidad y límites

Medido en pruebas (máquina de desarrollo hacia Supabase) o tomado de la documentación oficial. El espacio en disco por registro es una **estimación**, no una medición.

| Qué | Límite | Origen |
|---|---|---|
| Registros por tabla que la pantalla carga | 20.000 (avisa si hay más) | código (`TOPE_CARGA`) |
| Tiempo de carga de una tabla | ~0,6 s por cada 1.000 filas (5.000 ≈ 3 s, 20.000 ≈ 12-16 s) | medido |
| Búsqueda en pantalla con 20.000 filas | ~76 ms | medido |
| Filas por importación de Excel | 20.000 (unos 13 s) | código (`MAX_FILAS_IMPORTACION`) |
| Tamaño de una petición (Azure SWA) | 30 MB | documentación de Azure |
| Transferencia (Azure SWA, plan Free) | 100 GB al mes | documentación de Azure |
| Base de datos (Supabase, plan Free) | 500 MB, 5 GB de transferencia al mes, se pausa tras 1 semana sin uso, sin backups | documentación de Supabase |
| Registros en total (todas las empresas) | ~500.000 a 1.000.000 en 500 MB | estimación (250 a 550 bytes por registro con sus índices) |

Reglas aprendidas midiendo:
- Supabase corta cada respuesta en **1.000 filas**: cualquier lectura de una tabla grande debe paginar (`/api/records/[id]?desde=&limite=`).
- **Nunca insertar miles de filas en una sola llamada** (`src/lib/insertar.ts`): la librería de Supabase tiene un paso cuadrático que con ~20.000 filas dejó el servidor colgado más de 5 minutos, para todos los usuarios.
- La transferencia es el primer límite en llegar con muchos usuarios: abrir una tabla de 5.000 filas descarga ~1 MB. Por eso agregar un registro no vuelve a bajar la tabla entera.

## Pendiente antes de cobrar dinero real

- [ ] Sacar RUC como persona natural con negocio (SUNAT, online) y afiliarte a Culqi con llaves de producción.
- [ ] Crear y aprobar la plantilla de WhatsApp `resumen_semanal` en Meta Business Manager (sin plantilla aprobada, el script de recordatorio no puede mandar mensajes fuera de la ventana de 24hs).
- [ ] Guardar el teléfono del usuario en su perfil (`auth.users.phone` o una columna aparte) — el script de resumen semanal lo necesita y hoy no hay ninguna pantalla que lo pida.
- [ ] Definir qué pasa si `estado` de la suscripción no es `activa` (hoy no hay ningún bloqueo real en la app para empresas sin pagar).
- [ ] Subir el archivo Excel original a Supabase Storage como respaldo (hoy se parsea y se descarta).
