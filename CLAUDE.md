# Frondix — contexto del proyecto

ERP/CRM SaaS para pequeños negocios latinoamericanos (Next.js App Router + Supabase).
Dueño: Luis Alvarez. Repo: `luisar8919/frondix`. Producción: `https://www.frondix.com`
(Azure Static Web Apps, deploy automático al pushear a `main` — ver
`.github/workflows/azure-static-web-apps-orange-sky-075119810.yml`).

Este archivo se carga automáticamente al abrir el proyecto. Mantenerlo corto y
actualizado — solo lo que hace falta para no re-explorar el proyecto ni repetir
errores ya resueltos. Creado el 2026-11-26 (primer barrido completo del repo).

## Reglas permanentes (no romper)

- Español en nombres de variables, funciones, comentarios y UI — identificadores
  internos (`RecetasModulo`, `recetas.ts`, etc.) pueden diferir del nombre que ve
  el usuario si se renombra solo la UI (ej. "Recetas" → "Automatizaciones").
- **Multi-tenant por `empresa_id` + RLS de Supabase**, nunca filtrado a mano en
  el cliente — cualquier query nueva a `records`/`datasets` debe confiar en RLS,
  no reimplementar el filtro de empresa.
- **Roles**: `dueno` / `admin` / `vendedor`. Un vendedor NO ve Compras/costos
  (chequeo explícito vía `tipoModulo(...) === "compras"` + `rolEnEmpresa`,
  repetido por archivo — no hay un único punto central, si se agrega un
  endpoint sensible nuevo hay que replicar el chequeo).
- **`PATCH /api/records/[datasetId]/[recordId]` REEMPLAZA todo el `data` JSONB**,
  nunca lo mezcla — cualquier caller debe armar `{...registro.data, ...cambios}`
  antes de mandarlo (patrón `guardarCelda` en `dashboard/[datasetId]/page.tsx`).
  Olvidarlo borra en silencio el resto de los campos del registro.
- **Paginación de Supabase (corta en 1000 filas)**: usar `leerTodasLasFilas()`
  de `src/lib/paginacion.ts` para cualquier "leer todo el dataset" — no
  reimplementar el loop `range(desde, desde+999)` a mano (estaba duplicado en
  10 lugares hasta el barrido del 2026-11-26).
- **WhatsApp (Cloud API, número único compartido de la plataforma) es SOLO
  para avisar al DUEÑO/usuario de Frondix, nunca al cliente final de un
  negocio** — decisión explícita (2026-11-25/26): un cliente final recibiendo
  un WhatsApp de un número que no reconoce (no el del negocio real) es mala
  experiencia, y Meta cobra por mensaje. Para avisarle algo al cliente final
  hay 2 caminos legítimos: el link `wa.me` manual (clic-para-chatear desde el
  propio celular del dueño, en Seguimiento/Ventanilla) o un correo
  (`enviar_correo_cliente` en Reglas, con SMTP propio opcional). La acción
  `enviar_whatsapp` de Reglas fue eliminada por esto mismo.
- **Notificaciones al dueño por 4 canales posibles**: App (push, Firebase),
  Correo, Telegram (gratis, opt-in por empresa) y WhatsApp (con costo real por
  mensaje — usar con cuidado, solo en los 2 avisos de sistema ya existentes,
  nunca en texto libre que el usuario escriba, porque Meta exige plantilla fija
  pre-aprobada para eso). Ver `/dashboard/notificaciones` para el estado real.
- Tras cualquier edición de `.ts`/`.tsx`, correr `npx tsc --noEmit` antes de dar
  por terminado el cambio — no está en CI, nadie más lo va a atrapar.

## Arquitectura / flujo general

- **Dataset genérico**: cualquier módulo (Ventas, Compras, Stock, Reservas...)
  es una fila en `datasets` (columnas + reglas en JSONB) + filas en `records`
  (datos en JSONB). El "significado" de una columna (`rol`: cliente, monto,
  producto, telefono, estado...) es lo que activa cada feature — Reportes,
  Seguimiento, Stock, Cuentas por cobrar, todo lee por `rol`, nunca por nombre
  de columna. Ver `src/lib/roles.ts`.
- **Plantillas de módulo** (`src/lib/plantillasModulo.ts`): al crear un módulo
  nuevo, el usuario elige un rubro (Ventas, Reservas, Delivery, Alquiler de
  equipos, Órdenes de servicio, Eventos, Obras...) y nace con columnas/roles ya
  mapeados.
- **Reglas** (`src/lib/reglas.ts`/`reglasAplicar.ts`, UI en `ReglasModulo.tsx`,
  pantalla "Condicionales"): condición → acción, evaluada en cada
  creación/modificación/eliminación de un registro. **Recetas** (`recetas.ts`/
  `RecetasModulo.tsx`, pantalla "Automatizaciones") son Reglas pre-armadas en
  lenguaje simple, un clic para activar — mismo motor, no un sistema aparte.
- **Ventanilla de atención** (`/dashboard/ventanilla`, `VentanillaAtencion.tsx`):
  para negocios SIN stock (Reservas, Delivery, Alquileres...) — un módulo
  califica si tiene `estado` con `opcionesFijas` + (`cliente` o `telefono`).
  Generaliza "registrar + cambiar estado con un botón" sin pantalla por rubro.
- **Punto de Venta** (`/dashboard/pos`, `PuntoDeVenta.tsx`): para negocios CON
  stock — requiere un módulo de Ventas con "Producto" enlazado a un Stock real
  (`esStock()` en `stock.ts`: columna producto + clave `cantidad`).
- **Notificaciones**: push (Firebase, `src/lib/push.ts`), correo (`email.ts`,
  2 funciones distintas: `enviarCorreo` al dueño vs `enviarCorreoAlCliente` al
  cliente final, nunca confundirlas), WhatsApp (`whatsapp.ts`, solo
  `enviarPlantilla`, nunca texto libre), Telegram (`telegram.ts`, opt-in).
  2 crons (`api/cron/seguimiento-push` cada 6h, `api/cron/vencimientos-push`
  diario) disparados por GitHub Actions con `x-cron-secret`.
- **Facturación/suscripción**: Culqi (tarjeta recurrente + Yape manual, sin
  firma de webhook — mitigado reconfirmando contra la API), PayPal y Paddle
  como alternativas internacionales (Paddle sí firma su webhook). FactPro para
  facturación electrónica SUNAT (entornos demo/producción).

## Deuda técnica conocida (ver barrido completo del 2026-11-26 en el historial de chat)

- Sin tests automatizados (solo `npm run test:parser`, manual, no corre en CI).
- Sin `tsc`/lint en el pipeline de Azure — se corre a mano.
- Sin monitoreo de errores (Sentry y similares) ni analítica de producto.
- Webhook de WhatsApp entrante (`api/whatsapp/webhook`) solo hace `console.log`
  del mensaje — no se persiste en ningún lado todavía.
- `Clientes`/`Proveedores` son implementaciones casi espejo
  (`ListaClientes`/`FichaCliente` vs `ListaProveedores`/`FichaProveedor`).
- Sin conversión de moneda real entre módulos en distinta moneda (documentado
  como limitación aceptada en la propia UI).
