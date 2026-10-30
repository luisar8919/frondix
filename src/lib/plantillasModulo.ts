import type { Columna } from "./excel-parser.ts";

// Columnas iniciales para crear un módulo de Compras o Ventas sin subir Excel
// -- el mismo significado (rol) que ya detecta sugerirRoles, así que el módulo
// queda automáticamente enganchado a Reportes, a la pestaña Compras/Ventas
// (ver tipoModulo) y al botón "+ Registrar compra/venta".
export function plantillaVentas(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "costo", label: "Costo", tipo: "numero", rol: "costo", sospechosa: false },
    { key: "gastos_venta", label: "Gastos de venta", tipo: "numero", rol: "gastos", sospechosa: false },
  ];
}

export function plantillaCompras(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "proveedor", label: "Proveedor", tipo: "texto", rol: "proveedor", sospechosa: false },
    { key: "producto", label: "Producto o concepto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "gastos_compra", label: "Gastos de compra", tipo: "numero", rol: "gastos", sospechosa: false },
  ];
}

// Plantillas extra (más allá de Ventas/Compras) para negocios que ya pasaron
// el estadio básico. Regla seguida en TODAS: nunca combinar "producto" con
// "monto" en el mismo módulo (tipoModulo las clasificaría como "ventas" y
// aparecerían en el tab de Ventas/reportes de ingresos, que no es lo que son)
// -- cuando el módulo necesita descripción + importe junto, el importe usa
// "costo" en vez de "monto" (no dispara esa reclasificación). Tampoco se usan
// los roles "cliente"/"proveedor" salvo que el módulo sea de verdad eso (acá
// ninguno lo es), para no mezclarlos con las pestañas Ventas/Compras ni con
// Clientes/Proveedores. Y ningún campo de cantidad se llama literal
// "Cantidad" junto a un campo "producto": esStock() (stock.ts) detecta un
// módulo de Stock por la combinación exacta clave "cantidad" + rol
// "producto", así que un nombre más descriptivo ("Cantidad producida",
// "Cantidad perdida"...) evita que estas plantillas se confundan con Stock.

export function plantillaGastos(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "categoria", label: "Categoría", tipo: "texto", rol: "categoria", sospechosa: false },
    { key: "concepto", label: "Concepto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto", tipo: "numero", rol: "costo", sospechosa: false },
  ];
}

// A propósito usa rol "proveedor" (clasifica directo como "compras", sin
// depender del nombre de la tabla) y rol "saldo_pendiente": así, a diferencia
// del resto de plantillas extra, ÉSTA sí alimenta una función que ya existe
// (src/lib/cuentasPorPagar.ts + la tarjeta "Cuentas por pagar" de Inicio) en
// vez de ser un concepto aparte con el mismo nombre -- antes de este cambio
// había dos cosas distintas llamadas "Cuentas por pagar" en la app.
export function plantillaCuentasPorPagar(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "proveedor", label: "Proveedor", tipo: "texto", rol: "proveedor", sospechosa: false },
    { key: "concepto", label: "Concepto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto total", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "saldo_pendiente", label: "Saldo pendiente", tipo: "numero", rol: "saldo_pendiente", sospechosa: false },
    { key: "fecha_vencimiento", label: "Fecha de vencimiento", tipo: "fecha", rol: null, sospechosa: false },
  ];
}

export function plantillaActivosFijos(): Columna[] {
  return [
    { key: "fecha_compra", label: "Fecha de compra", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "activo", label: "Activo", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "categoria", label: "Categoría", tipo: "texto", rol: "categoria", sospechosa: false },
    { key: "codigo", label: "Código / etiqueta", tipo: "texto", rol: "codigo", sospechosa: false },
    { key: "valor", label: "Valor de compra", tipo: "numero", rol: "costo", sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaOrdenesServicio(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: null, sospechosa: false },
    { key: "trabajo", label: "Trabajo a realizar", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
    { key: "monto", label: "Monto cobrado", tipo: "numero", rol: "costo", sospechosa: false },
  ];
}

export function plantillaMermas(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "motivo", label: "Motivo", tipo: "texto", rol: "categoria", sospechosa: false },
    { key: "cantidad_perdida", label: "Cantidad perdida", tipo: "numero", rol: null, sospechosa: false },
    { key: "valor_perdido", label: "Valor perdido", tipo: "numero", rol: "costo", sospechosa: false },
  ];
}

export function plantillaProduccion(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "producto_terminado", label: "Producto terminado", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "cantidad_producida", label: "Cantidad producida", tipo: "numero", rol: null, sospechosa: false },
    { key: "insumos_usados", label: "Insumos usados", tipo: "texto", rol: null, sospechosa: false },
    { key: "costo_produccion", label: "Costo de producción", tipo: "numero", rol: "costo", sospechosa: false },
  ];
}

export function plantillaConsignacion(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "lugar", label: "Local / lugar", tipo: "texto", rol: null, sospechosa: false },
    { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "cantidad_entregada", label: "Cantidad entregada", tipo: "numero", rol: null, sospechosa: false },
    { key: "cantidad_vendida", label: "Cantidad vendida", tipo: "numero", rol: null, sospechosa: false },
    { key: "monto_a_cobrar", label: "Monto a cobrar", tipo: "numero", rol: "costo", sospechosa: false },
  ];
}

export function plantillaReservas(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "hora", label: "Hora", tipo: "texto", rol: null, sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: null, sospechosa: false },
    { key: "telefono", label: "Teléfono", tipo: "texto", rol: null, sospechosa: false },
    { key: "servicio", label: "Servicio", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaTraslados(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "origen", label: "Almacén origen", tipo: "texto", rol: null, sospechosa: false },
    { key: "destino", label: "Almacén destino", tipo: "texto", rol: null, sospechosa: false },
    { key: "cantidad_trasladada", label: "Cantidad trasladada", tipo: "numero", rol: null, sospechosa: false },
  ];
}

// Segundo lote de plantillas extra. Estas SÍ combinan "cliente" con
// "producto"/"monto" a propósito (cobrar una membresía, un alquiler, un
// proyecto o un evento es un ingreso real, igual que Órdenes de
// servicio/Consignación) -- tipoModulo las clasifica "ventas" y eso es lo
// correcto, no un efecto secundario a evitar. "Importaciones" es la
// excepción: usa "proveedor" a propósito para clasificar "compras".

export function plantillaMembresias(): Columna[] {
  return [
    { key: "fecha_inicio", label: "Fecha de inicio", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "plan", label: "Plan", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto_mensual", label: "Monto mensual", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "fecha_vencimiento", label: "Fecha de vencimiento", tipo: "fecha", rol: null, sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaAlquileres(): Columna[] {
  return [
    { key: "fecha_inicio", label: "Fecha de inicio", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "inquilino", label: "Inquilino", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "propiedad", label: "Propiedad", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto_mensual", label: "Monto mensual", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "fecha_pago", label: "Próxima fecha de pago", tipo: "fecha", rol: null, sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaMatriculas(): Columna[] {
  return [
    { key: "fecha_inscripcion", label: "Fecha de inscripción", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "alumno", label: "Alumno", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "curso", label: "Curso", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "mensualidad", label: "Mensualidad", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "fecha_vencimiento", label: "Fecha de vencimiento", tipo: "fecha", rol: null, sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaObras(): Columna[] {
  return [
    { key: "fecha_inicio", label: "Fecha de inicio", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "proyecto", label: "Proyecto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "presupuesto", label: "Presupuesto", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "avance", label: "Avance (%)", tipo: "numero", rol: null, sospechosa: false },
    { key: "fecha_fin_estimada", label: "Fecha fin estimada", tipo: "fecha", rol: null, sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaEventos(): Columna[] {
  return [
    { key: "fecha_evento", label: "Fecha del evento", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "tipo_evento", label: "Tipo de evento", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaDelivery(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "pedido", label: "Pedido", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "direccion", label: "Dirección de entrega", tipo: "texto", rol: "direccion", sospechosa: false },
    { key: "repartidor", label: "Repartidor", tipo: "texto", rol: null, sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaAlquilerEquipos(): Columna[] {
  return [
    { key: "fecha_salida", label: "Fecha de salida", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "cliente", label: "Cliente", tipo: "texto", rol: "cliente", sospechosa: false },
    { key: "equipo", label: "Equipo", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "monto", label: "Monto", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "fecha_devolucion", label: "Fecha de devolución", tipo: "fecha", rol: null, sospechosa: false },
    { key: "estado", label: "Estado", tipo: "texto", rol: null, sospechosa: false },
  ];
}

export function plantillaImportaciones(): Columna[] {
  return [
    { key: "fecha", label: "Fecha", tipo: "fecha", rol: "fecha", sospechosa: false },
    { key: "proveedor", label: "Proveedor", tipo: "texto", rol: "proveedor", sospechosa: false },
    { key: "producto", label: "Producto", tipo: "texto", rol: "producto", sospechosa: false },
    { key: "costo_producto", label: "Costo del producto", tipo: "numero", rol: "monto", sospechosa: false },
    { key: "flete", label: "Flete", tipo: "numero", rol: null, sospechosa: false },
    { key: "aduana", label: "Aduana / aranceles", tipo: "numero", rol: null, sospechosa: false },
    { key: "costo_total", label: "Costo total", tipo: "numero", rol: "costo", sospechosa: false },
  ];
}

// Catálogo para ofrecerlas en una UI (selector de plantillas, etc.) sin tener
// que importar cada función una por una en cada lugar que las necesite.
// Categorías para la pantalla de selección (/dashboard/modulos/nuevo y la app
// nativa): en vez de mostrar las 9 plantillas de una, primero se pregunta
// "¿qué tipo de negocio tenés?" -- mismo patrón ya usado para Ventas/Compras/
// Stock/Proveedor/Cliente en el menú de Módulos. El orden importa: es el
// orden en que se muestran las categorías.
export const CATEGORIAS_MODULOS = [
  { clave: "stock_local", titulo: "Tengo un local con stock", descripcion: "Ej. bodegas, minimarkets, farmacias, ferreterías: productos físicos que se vencen, se dañan o se mueven entre locales." },
  { clave: "servicios", titulo: "Cobro por trabajos o servicios", descripcion: "Ej. talleres mecánicos, peluquerías, consultorios, restaurantes con delivery: cobras por un trabajo o una cita, no por un producto." },
  { clave: "produccion", titulo: "Fabrico o produzco algo", descripcion: "Ej. panaderías, talleres de costura, carpinterías: transformas insumos en un producto terminado." },
  { clave: "finanzas", titulo: "Control financiero", descripcion: "Ej. negocios que alquilan su local, importan mercadería o tienen equipos propios: gastos, deudas con proveedores, activos." },
  { clave: "consignacion", titulo: "Vendo para otros", descripcion: "Ej. artesanos, autores independientes: dejas mercadería en otro local para que te la vendan." },
  { clave: "cobro_recurrente", titulo: "Cobro recurrente o membresías", descripcion: "Ej. gimnasios, academias, colegios, alquiler de propiedades: un cliente te paga cada mes." },
  { clave: "proyectos", titulo: "Trabajo por proyectos o eventos", descripcion: "Ej. constructoras, contratistas, organizadores de eventos: cada cliente es un proyecto con fecha y presupuesto propio." },
] as const;

export const PLANTILLAS_EXTRA = [
  { clave: "gastos", nombre: "Gastos operativos", descripcion: "Alquiler, sueldos, servicios: lo que gastas aparte de lo que compras para revender.", categoria: "finanzas", columnas: plantillaGastos },
  { clave: "cuentas_por_pagar", nombre: "Cuentas por pagar", descripcion: "Lo que tú le debes a proveedores o servicios, con fecha de vencimiento.", categoria: "finanzas", columnas: plantillaCuentasPorPagar },
  { clave: "activos_fijos", nombre: "Activos fijos", descripcion: "Maquinaria, computadoras, vehículos del negocio (no para vender).", categoria: "finanzas", columnas: plantillaActivosFijos },
  { clave: "importaciones", nombre: "Importaciones", descripcion: "Costo real de lo que traes del extranjero: producto, flete y aduana juntos.", categoria: "finanzas", columnas: plantillaImportaciones },
  { clave: "ordenes_servicio", nombre: "Órdenes de servicio", descripcion: "Para talleres y reparaciones: seguir un trabajo desde que entra hasta que se entrega.", categoria: "servicios", columnas: plantillaOrdenesServicio },
  { clave: "delivery", nombre: "Delivery / pedidos a domicilio", descripcion: "Pedidos con dirección de entrega y repartidor, hasta que se marcan entregados.", categoria: "servicios", columnas: plantillaDelivery },
  { clave: "alquiler_equipos", nombre: "Alquiler de equipos", descripcion: "Qué prestaste, a quién y cuándo tiene que devolverlo.", categoria: "servicios", columnas: plantillaAlquilerEquipos },
  { clave: "mermas", nombre: "Mermas / pérdidas", descripcion: "Productos vencidos, dañados o perdidos, separado de las ventas reales.", categoria: "stock_local", columnas: plantillaMermas },
  { clave: "produccion", nombre: "Producción / insumos", descripcion: "Cuánto fabricas y qué insumos usas, para calcular el costo real por unidad.", categoria: "produccion", columnas: plantillaProduccion },
  { clave: "consignacion", nombre: "Consignación", descripcion: "Mercadería que dejas en otro local para que te la vendan y te paguen después.", categoria: "consignacion", columnas: plantillaConsignacion },
  { clave: "reservas", nombre: "Reservas / citas", descripcion: "Para salones, clínicas o talleres con cita previa: agenda de turnos.", categoria: "servicios", columnas: plantillaReservas },
  { clave: "traslados", nombre: "Traslados entre almacenes", descripcion: "Mover stock entre locales o almacenes sin que parezca una venta o compra.", categoria: "stock_local", columnas: plantillaTraslados },
  { clave: "membresias", nombre: "Membresías", descripcion: "Gimnasios, academias, clubes: cobro mensual con fecha de vencimiento.", categoria: "cobro_recurrente", columnas: plantillaMembresias },
  { clave: "alquileres", nombre: "Alquileres", descripcion: "Propiedades o locales que alquilas, con inquilino y fecha de pago.", categoria: "cobro_recurrente", columnas: plantillaAlquileres },
  { clave: "matriculas", nombre: "Matrículas", descripcion: "Colegios, institutos, guarderías: mensualidad por alumno.", categoria: "cobro_recurrente", columnas: plantillaMatriculas },
  { clave: "obras", nombre: "Obras / proyectos", descripcion: "Construcción o contratistas: presupuesto y avance por proyecto.", categoria: "proyectos", columnas: plantillaObras },
  { clave: "eventos", nombre: "Eventos", descripcion: "Fiestas, catering, eventos corporativos: un cobro por cada evento.", categoria: "proyectos", columnas: plantillaEventos },
] as const;
