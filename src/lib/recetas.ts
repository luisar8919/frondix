import type { Columna } from "./excel-parser.ts";
import type { Regla } from "./reglas.ts";
import { tipoModulo } from "./roles.ts";
import { esStock } from "./stock.ts";

// "Recetas" = reglas pre-armadas para quien no quiere ver Campo/Operador/
// Acción: un ícono, una frase en español llano y A LO SUMO un valor a
// completar (un número o un texto). El editor técnico (ReglasModulo, "modo
// avanzado") sigue intacto para lo que no entra en ninguna receta.
//
// CENTRALIZACIÓN (pedido explícito): este archivo es el ÚNICO lugar que arma
// el objeto `{condicion, accion}` de cada receta -- cualquier otro punto del
// código que necesite crear una de estas reglas sola (el espejo de
// "Ajustar Stock" al crear un enlace Producto->Stock, las sugeridas de
// plantillasModulo.ts al crear un módulo nuevo) llama a `construir()` de acá
// en vez de repetir el literal. Así, si un día hay que cambiar CÓMO se arma
// una receta (como se hizo a mano este mismo día, migrando el ajuste de
// Stock de la acción fija a una genérica con cantidad real), se cambia en un
// solo lugar.
//
// `coincideCon` reconoce una receta activa aunque la regla se haya armado a
// mano desde el editor avanzado (misma forma = misma receta) -- no hace
// falta que haya pasado por `construir()` para contar como "ya activa".
export interface Receta {
  clave: string;
  icono: string;
  titulo: string;
  tipoValor: "numero" | "texto" | "ninguno";
  valorPorDefecto: string;
  descripcion: (valor: string) => string;
  // true = solo tiene sentido para un rubro puntual (detectado por estructura:
  // la columna exacta de esa plantilla + un valor de Estado que solo esa
  // plantilla trae de fábrica -- nunca por el nombre del módulo). Se muestran
  // en su propia sección de la galería, separadas de las generales (ver
  // RecetasModulo.tsx), y solo si de verdad aplican (nunca se listan apagadas).
  especifica: boolean;
  aplicaA: (columnas: Columna[], nombre: string) => boolean;
  // Qué le falta al módulo para poder usarla -- se muestra en la tarjeta
  // deshabilitada cuando `aplicaA` da false (ver comentario de la galería
  // completa en RecetasModulo.tsx).
  requisito: string;
  // Lista cerrada de valores para el campo (ej. los opcionesFijas reales de
  // Estado) -- si existe, la UI muestra un <select> en vez de un input libre.
  opcionesValor?: (columnas: Columna[]) => string[] | null;
  construir: (columnas: Columna[], valor: string) => Omit<Regla, "id"> | null;
  coincideCon: (regla: Regla, columnas: Columna[]) => boolean;
  extraerValor: (regla: Regla) => string;
}

const col = (columnas: Columna[], rol: string) => columnas.find((c) => c.rol === rol);
const valorCondicionCampo = (r: Regla) => (r.condicion.tipo === "campo" ? r.condicion.valor : r.condicion.tipo === "estado" ? r.condicion.valor : "");

export const RECETAS: Receta[] = [
  {
    clave: "ajustar_stock",
    especifica: false,
    icono: "📦",
    titulo: "Ajustar Stock automáticamente",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Cada venta o compra descuenta o suma la Cantidad real en el Stock enlazado.",
    requisito: "Este módulo debe ser de Ventas o Compras, con un Producto enlazado a un módulo de Stock.",
    aplicaA: (columnas, nombre) => {
      const tipo = tipoModulo(columnas.map((c) => c.rol), nombre);
      return (tipo === "ventas" || tipo === "compras") && !!col(columnas, "producto")?.enlace;
    },
    construir: () => ({ activa: true, origen: "automatica", condicion: { tipo: "siempre" }, accion: { tipo: "ajustar_stock" } }),
    // Reconoce también la versión homologada a mano (sumar_campo_enlazado con
    // la Cantidad real en vez de la acción fija "ajustar_stock", ver la
    // migración de la cuenta de prueba) -- misma función, forma distinta.
    // Sin esto, "Activar" crearía una SEGUNDA regla de ajuste y el Stock se
    // descontaría doble en cada venta.
    coincideCon: (r, columnas) => {
      if (r.accion.tipo === "ajustar_stock") return true;
      if (r.accion.tipo !== "sumar_campo_enlazado") return false;
      const a = r.accion;
      if (a.modo === "fijar") return false;
      const cEnlace = columnas.find((c) => c.key === a.columnaEnlaceKey);
      return a.columnaObjetivoKey === "cantidad" && cEnlace?.rol === "producto" && !!cEnlace.enlace;
    },
    extraerValor: () => "",
  },
  {
    clave: "aviso_registro_grande",
    especifica: false,
    icono: "🔔",
    titulo: "Avisarme en registros grandes",
    tipoValor: "numero",
    valorPorDefecto: "500",
    descripcion: (v) => `Te avisamos cuando el Monto de un registro supere ${v}.`,
    requisito: "Necesita un campo con significado \"Monto\".",
    aplicaA: (columnas) => !!col(columnas, "monto"),
    construir: (columnas, valor) => {
      const cMonto = col(columnas, "monto");
      if (!cMonto) return null;
      return {
        activa: true, origen: "manual", evento: ["creacion"],
        condicion: { tipo: "campo", columnaKey: cMonto.key, operador: "mayor", valor },
        accion: { tipo: "notificacion_push", titulo: "Registro grande", mensaje: `Se registró un monto mayor a ${valor}` },
      };
    },
    // Por ESTRUCTURA (condición Monto > algo + push), no por el título exacto
    // -- reconoce también una regla armada a mano con un mensaje propio
    // ("Venta grande", "Compra grande"...), no solo la creada por esta receta.
    coincideCon: (r, columnas) => {
      const cMonto = col(columnas, "monto");
      return !!cMonto && r.accion.tipo === "notificacion_push" && r.condicion.tipo === "campo" && r.condicion.columnaKey === cMonto.key && r.condicion.operador === "mayor" && !r.condicion.compararColumnaKey;
    },
    extraerValor: valorCondicionCampo,
  },
  {
    clave: "notificacion_personalizada",
    especifica: false,
    icono: "📣",
    titulo: "Enviarme una notificación personalizada",
    tipoValor: "texto",
    valorPorDefecto: "Se registró un movimiento nuevo en este módulo.",
    descripcion: (v) => `Cada vez que se cree un registro nuevo acá, te llega este mensaje: "${v}".`,
    requisito: "",
    aplicaA: () => true,
    construir: (columnas, valor) => ({
      activa: true, origen: "manual", evento: ["creacion"],
      condicion: { tipo: "siempre" },
      accion: { tipo: "notificacion_push", titulo: "Aviso personalizado", mensaje: valor || "Se registró un movimiento nuevo en este módulo." },
    }),
    // Por estructura (push + "siempre" + SOLO en creación), no por el mensaje
    // en sí -- así reconoce la receta activa sin importar qué texto hayas
    // puesto, y "Actualizar" la encuentra para editarla en vez de duplicarla.
    coincideCon: (r) => r.accion.tipo === "notificacion_push" && r.accion.titulo === "Aviso personalizado" && r.condicion.tipo === "siempre" && !!r.evento && r.evento.length === 1 && r.evento[0] === "creacion",
    extraerValor: (r) => (r.accion.tipo === "notificacion_push" ? r.accion.mensaje : ""),
  },
  {
    clave: "notificar_cliente_correo",
    especifica: false,
    icono: "📧",
    titulo: "Enviarle un correo al cliente",
    tipoValor: "texto",
    valorPorDefecto: "Gracias por tu compra. Cualquier consulta, escríbenos.",
    descripcion: (v) => `Cada vez que se cree un registro nuevo con su correo cargado, le llega este mensaje: "${v}".`,
    requisito: "Necesita un campo con significado \"Correo electrónico\".",
    aplicaA: (columnas) => !!col(columnas, "correo"),
    construir: (columnas, valor) => ({
      activa: true, origen: "manual", evento: ["creacion"],
      condicion: { tipo: "siempre" },
      accion: { tipo: "enviar_correo_cliente", mensaje: valor || "Gracias por tu compra. Cualquier consulta, escríbenos." },
    }),
    // Por estructura (igual criterio que "notificacion_personalizada"): no
    // importa el texto del mensaje, importa que sea ESTA acción en "siempre"
    // + solo creación.
    coincideCon: (r) => r.accion.tipo === "enviar_correo_cliente" && r.condicion.tipo === "siempre" && !!r.evento && r.evento.length === 1 && r.evento[0] === "creacion",
    extraerValor: (r) => (r.accion.tipo === "enviar_correo_cliente" ? r.accion.mensaje : ""),
  },
  {
    clave: "aviso_eliminacion",
    especifica: false,
    icono: "🗑️",
    titulo: "Avisarme si se elimina un registro",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Te avisamos apenas se borra cualquier fila de este módulo.",
    requisito: "",
    aplicaA: () => true,
    construir: () => ({
      activa: true, origen: "manual", evento: ["eliminacion"],
      condicion: { tipo: "siempre" },
      accion: { tipo: "notificacion_push", titulo: "Registro eliminado", mensaje: "Se eliminó un registro" },
    }),
    // Igual criterio: por estructura (push + evento SOLO eliminación), no por
    // el título -- "Venta eliminada" cuenta igual que "Registro eliminado".
    coincideCon: (r) => r.accion.tipo === "notificacion_push" && r.condicion.tipo === "siempre" && !!r.evento && r.evento.length === 1 && r.evento[0] === "eliminacion",
    extraerValor: () => "",
  },
  {
    clave: "excluir_cancelados",
    especifica: false,
    icono: "🚫",
    titulo: "No contar los cancelados en Reportes",
    tipoValor: "texto",
    valorPorDefecto: "Cancelado",
    descripcion: (v) => `Si el Estado queda en "${v}", no se suma como ingreso en Reportes.`,
    requisito: "Necesita un campo \"Estado\" con una lista cerrada de valores (ej. Pendiente/Cancelado).",
    aplicaA: (columnas) => (col(columnas, "estado")?.opcionesFijas?.length ?? 0) > 0,
    opcionesValor: (columnas) => col(columnas, "estado")?.opcionesFijas ?? null,
    construir: (columnas, valor) => {
      const cEstado = col(columnas, "estado");
      if (!cEstado) return null;
      return {
        activa: true, origen: "manual",
        condicion: { tipo: "campo", columnaKey: cEstado.key, operador: "es", valor },
        accion: { tipo: "excluir_de_reportes" },
      };
    },
    coincideCon: (r, columnas) => {
      const cEstado = col(columnas, "estado");
      return !!cEstado && r.accion.tipo === "excluir_de_reportes" && (r.condicion.tipo === "campo" || r.condicion.tipo === "estado") && r.condicion.columnaKey === cEstado.key;
    },
    extraerValor: valorCondicionCampo,
  },
  {
    clave: "cliente_por_defecto",
    especifica: false,
    icono: "🔄",
    titulo: "Completar Cliente si queda vacío",
    tipoValor: "texto",
    valorPorDefecto: "Cliente mostrador",
    descripcion: (v) => `Si no se escribe un Cliente, se completa solo con "${v}".`,
    requisito: "Necesita un campo con significado \"Cliente\" de texto libre (sin lista cerrada).",
    aplicaA: (columnas) => !!col(columnas, "cliente") && !col(columnas, "cliente")?.opcionesFijas?.length,
    construir: (columnas, valor) => {
      const cCliente = col(columnas, "cliente");
      if (!cCliente) return null;
      return {
        activa: true, origen: "manual", evento: ["creacion", "modificacion"],
        condicion: { tipo: "campo", columnaKey: cCliente.key, operador: "es", valor: "" },
        accion: { tipo: "cambiar_estado", columnaKey: cCliente.key, valor },
      };
    },
    coincideCon: (r, columnas) => {
      const cCliente = col(columnas, "cliente");
      return !!cCliente && r.accion.tipo === "cambiar_estado" && r.accion.columnaKey === cCliente.key && r.condicion.tipo === "campo" && r.condicion.columnaKey === cCliente.key && r.condicion.valor === "";
    },
    extraerValor: (r) => (r.accion.tipo === "cambiar_estado" ? r.accion.valor : ""),
  },
  {
    clave: "seguimiento_automatico",
    especifica: false,
    icono: "👀",
    titulo: "Activar Seguimiento de clientes solo",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Cada registro nuevo activa el seguimiento de ese cliente (avisa si deja de comprar).",
    requisito: "Necesita un campo con significado \"Cliente\".",
    aplicaA: (columnas) => !!col(columnas, "cliente"),
    construir: () => ({ activa: true, origen: "manual", evento: ["creacion"], condicion: { tipo: "siempre" }, accion: { tipo: "agregar_seguimiento" } }),
    coincideCon: (r) => r.accion.tipo === "agregar_seguimiento" && r.condicion.tipo === "siempre",
    extraerValor: () => "",
  },
  {
    clave: "stock_bajo",
    especifica: false,
    icono: "⚠️",
    titulo: "Avisarme cuando el Stock esté por agotarse",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Avisa cuando la Cantidad de un producto llega a su Stock mínimo.",
    requisito: "Este módulo debe ser de Stock, con un campo \"Stock mínimo\".",
    aplicaA: (columnas) => esStock(columnas) && !!col(columnas, "stock_minimo"),
    construir: (columnas) => {
      const cMin = col(columnas, "stock_minimo");
      if (!cMin) return null;
      return {
        activa: true, origen: "manual",
        condicion: { tipo: "campo", columnaKey: "cantidad", operador: "menor_igual", valor: "", compararColumnaKey: cMin.key },
        accion: { tipo: "notificacion_push", titulo: "Stock bajo", mensaje: "Un producto llegó a su stock mínimo" },
      };
    },
    coincideCon: (r, columnas) => {
      const cMin = col(columnas, "stock_minimo");
      return !!cMin && r.accion.tipo === "notificacion_push" && r.accion.titulo === "Stock bajo" && r.condicion.tipo === "campo" && r.condicion.columnaKey === "cantidad" && r.condicion.compararColumnaKey === cMin.key;
    },
    extraerValor: () => "",
  },
  {
    clave: "descontar_insumos_por_venta",
    especifica: false,
    icono: "🥘",
    titulo: "Descontar insumos de una receta por cada venta",
    tipoValor: "texto",
    valorPorDefecto: "Carne:0.2, Papa:0.3, Cebolla:0.1",
    descripcion: () => `Cada vez que se venda este producto, se descuenta del Stock enlazado lo que escribas acá (una fila por insumo, separadas por coma, "Insumo:cantidad por unidad vendida").`,
    requisito: "Este módulo debe ser de Ventas, con un Producto enlazado a un módulo de Stock.",
    aplicaA: (columnas, nombre) => {
      const tipo = tipoModulo(columnas.map((c) => c.rol), nombre);
      return tipo === "ventas" && !!col(columnas, "producto")?.enlace;
    },
    construir: (columnas, valor) => ({
      activa: true, origen: "manual", evento: ["creacion", "modificacion", "eliminacion"],
      condicion: { tipo: "siempre" },
      accion: { tipo: "descontar_insumos", receta: valor },
    }),
    coincideCon: (r) => r.accion.tipo === "descontar_insumos",
    extraerValor: (r) => (r.accion.tipo === "descontar_insumos" ? r.accion.receta : ""),
  },
  {
    clave: "eliminar_si_negativo",
    especifica: false,
    icono: "🧹",
    titulo: "Borrar producto si su Cantidad queda negativa",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Elimina el producto del Stock si su Cantidad queda por debajo de 0 (dato inconsistente).",
    requisito: "Este módulo debe ser de Stock.",
    aplicaA: (columnas) => esStock(columnas),
    construir: () => ({
      activa: true, origen: "manual", evento: ["modificacion"],
      condicion: { tipo: "campo", columnaKey: "cantidad", operador: "menor", valor: "0" },
      accion: { tipo: "eliminar_registro" },
    }),
    coincideCon: (r) => r.accion.tipo === "eliminar_registro" && r.condicion.tipo === "campo" && r.condicion.columnaKey === "cantidad" && r.condicion.operador === "menor" && r.condicion.valor === "0",
    extraerValor: () => "",
  },

  // Recetas ESPECÍFICAS por rubro (a partir de acá): a diferencia de las de
  // arriba (que aplican a cualquier módulo con cierto rol de columna), estas
  // además exigen la CLAVE exacta de columna que solo trae esa plantilla de
  // fábrica (ej. "pedido" en Delivery, "trabajo" en Órdenes de servicio) --
  // así "aplicaA" nunca da falso positivo en otro rubro que casualmente tenga
  // Teléfono + Estado, y se mantienen separadas de las generales en la UI
  // (ver la sección propia en RecetasModulo.tsx).
  {
    clave: "avisar_pedido_en_camino",
    especifica: true,
    icono: "🛵",
    titulo: "Avisarle al cliente que su pedido salió",
    tipoValor: "texto",
    valorPorDefecto: "Tu pedido ya salió, en un momento te lo entregamos.",
    descripcion: (v) => `Cuando el Estado pase a "En camino", le llega este WhatsApp al cliente: "${v}".`,
    requisito: "Este módulo debe ser de Delivery (plantilla), con Teléfono y un Estado que incluya \"En camino\".",
    aplicaA: (columnas) => {
      const cEstado = col(columnas, "estado");
      return !!col(columnas, "telefono") && columnas.some((c) => c.key === "pedido" && c.rol === "producto") && !!cEstado?.opcionesFijas?.includes("En camino");
    },
    construir: (columnas, valor) => {
      const cEstado = col(columnas, "estado");
      if (!cEstado) return null;
      return {
        activa: true, origen: "manual",
        condicion: { tipo: "campo", columnaKey: cEstado.key, operador: "es", valor: "En camino" },
        accion: { tipo: "enviar_whatsapp", mensaje: valor || "Tu pedido ya salió, en un momento te lo entregamos." },
      };
    },
    coincideCon: (r, columnas) => {
      const cEstado = col(columnas, "estado");
      return !!cEstado && r.accion.tipo === "enviar_whatsapp" && r.condicion.tipo === "campo" && r.condicion.columnaKey === cEstado.key && r.condicion.valor === "En camino";
    },
    extraerValor: (r) => (r.accion.tipo === "enviar_whatsapp" ? r.accion.mensaje : ""),
  },
  {
    clave: "avisar_trabajo_listo",
    especifica: true,
    icono: "🔧",
    titulo: "Avisarle al cliente que su trabajo está listo",
    tipoValor: "texto",
    valorPorDefecto: "Tu equipo ya está listo, puedes pasar a recogerlo.",
    descripcion: (v) => `Cuando el Estado pase a "Entregado", le llega este WhatsApp al cliente: "${v}".`,
    requisito: "Este módulo debe ser de Órdenes de servicio (plantilla), con Teléfono y un Estado que incluya \"Entregado\".",
    aplicaA: (columnas) => {
      const cEstado = col(columnas, "estado");
      return !!col(columnas, "telefono") && columnas.some((c) => c.key === "trabajo" && c.rol === "producto") && !!cEstado?.opcionesFijas?.includes("Entregado");
    },
    construir: (columnas, valor) => {
      const cEstado = col(columnas, "estado");
      if (!cEstado) return null;
      return {
        activa: true, origen: "manual",
        condicion: { tipo: "campo", columnaKey: cEstado.key, operador: "es", valor: "Entregado" },
        accion: { tipo: "enviar_whatsapp", mensaje: valor || "Tu equipo ya está listo, puedes pasar a recogerlo." },
      };
    },
    coincideCon: (r, columnas) => {
      const cEstado = col(columnas, "estado");
      return !!cEstado && r.accion.tipo === "enviar_whatsapp" && r.condicion.tipo === "campo" && r.condicion.columnaKey === cEstado.key && r.condicion.valor === "Entregado";
    },
    extraerValor: (r) => (r.accion.tipo === "enviar_whatsapp" ? r.accion.mensaje : ""),
  },
  {
    clave: "confirmar_reserva_cliente",
    especifica: true,
    icono: "💇",
    titulo: "Confirmarle al cliente su reserva",
    tipoValor: "texto",
    valorPorDefecto: "Tu reserva quedó confirmada. ¡Te esperamos!",
    descripcion: (v) => `Cuando el Estado pase a "Confirmada", le llega este WhatsApp al cliente: "${v}".`,
    requisito: "Este módulo debe ser de Reservas / citas (plantilla), con Teléfono y un Estado que incluya \"Confirmada\".",
    aplicaA: (columnas) => {
      const cEstado = col(columnas, "estado");
      return !!col(columnas, "telefono") && columnas.some((c) => c.key === "servicio" && c.rol === "producto") && !!cEstado?.opcionesFijas?.includes("Confirmada");
    },
    construir: (columnas, valor) => {
      const cEstado = col(columnas, "estado");
      if (!cEstado) return null;
      return {
        activa: true, origen: "manual",
        condicion: { tipo: "campo", columnaKey: cEstado.key, operador: "es", valor: "Confirmada" },
        accion: { tipo: "enviar_whatsapp", mensaje: valor || "Tu reserva quedó confirmada. ¡Te esperamos!" },
      };
    },
    coincideCon: (r, columnas) => {
      const cEstado = col(columnas, "estado");
      return !!cEstado && r.accion.tipo === "enviar_whatsapp" && r.condicion.tipo === "campo" && r.condicion.columnaKey === cEstado.key && r.condicion.valor === "Confirmada";
    },
    extraerValor: (r) => (r.accion.tipo === "enviar_whatsapp" ? r.accion.mensaje : ""),
  },
  {
    clave: "confirmar_evento_cliente",
    especifica: true,
    icono: "🎉",
    titulo: "Confirmarle al cliente su evento",
    tipoValor: "texto",
    valorPorDefecto: "Tu evento quedó confirmado. ¡Nos vemos pronto!",
    descripcion: (v) => `Cuando el Estado pase a "Confirmado", le llega este WhatsApp al cliente: "${v}".`,
    requisito: "Este módulo debe ser de Eventos (plantilla), con Teléfono y un Estado que incluya \"Confirmado\".",
    aplicaA: (columnas) => {
      const cEstado = col(columnas, "estado");
      return !!col(columnas, "telefono") && columnas.some((c) => c.key === "tipo_evento" && c.rol === "producto") && !!cEstado?.opcionesFijas?.includes("Confirmado");
    },
    construir: (columnas, valor) => {
      const cEstado = col(columnas, "estado");
      if (!cEstado) return null;
      return {
        activa: true, origen: "manual",
        condicion: { tipo: "campo", columnaKey: cEstado.key, operador: "es", valor: "Confirmado" },
        accion: { tipo: "enviar_whatsapp", mensaje: valor || "Tu evento quedó confirmado. ¡Nos vemos pronto!" },
      };
    },
    coincideCon: (r, columnas) => {
      const cEstado = col(columnas, "estado");
      return !!cEstado && r.accion.tipo === "enviar_whatsapp" && r.condicion.tipo === "campo" && r.condicion.columnaKey === cEstado.key && r.condicion.valor === "Confirmado";
    },
    extraerValor: (r) => (r.accion.tipo === "enviar_whatsapp" ? r.accion.mensaje : ""),
  },
  {
    clave: "avisar_obra_finalizada",
    especifica: true,
    icono: "🏗️",
    titulo: "Avisarme cuando una obra se marque Finalizada",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Te llega una notificación apenas el Estado de un proyecto pase a \"Finalizada\".",
    requisito: "Este módulo debe ser de Obras / proyectos (plantilla), con un Estado que incluya \"Finalizada\".",
    aplicaA: (columnas) => {
      const cEstado = col(columnas, "estado");
      return columnas.some((c) => c.key === "proyecto" && c.rol === "producto") && !!cEstado?.opcionesFijas?.includes("Finalizada");
    },
    construir: (columnas) => {
      const cEstado = col(columnas, "estado");
      if (!cEstado) return null;
      return {
        activa: true, origen: "manual",
        condicion: { tipo: "campo", columnaKey: cEstado.key, operador: "es", valor: "Finalizada" },
        accion: { tipo: "notificacion_push", titulo: "Obra finalizada", mensaje: "Un proyecto se marcó como Finalizada" },
      };
    },
    coincideCon: (r, columnas) => {
      const cEstado = col(columnas, "estado");
      return !!cEstado && r.accion.tipo === "notificacion_push" && r.accion.titulo === "Obra finalizada" && r.condicion.tipo === "campo" && r.condicion.columnaKey === cEstado.key && r.condicion.valor === "Finalizada";
    },
    extraerValor: () => "",
  },
];

// Acceso directo por clave -- lo usan los puntos del código que crean una
// receta SOLOS, sin pasar por la UI (ver comentario de centralización
// arriba): enlazarStockAutomatico (api/datasets/crear, api/upload/auto) y
// las reglasSugeridas de plantillasModulo.ts.
export function recetaPorClave(clave: string): Receta {
  const r = RECETAS.find((x) => x.clave === clave);
  if (!r) throw new Error(`Receta desconocida: ${clave}`);
  return r;
}

// Arma la nueva lista de reglas del módulo tras activar/actualizar/desactivar
// una receta -- centraliza también ESTA lógica (antes la hubiera repetido
// cada componente que quisiera aplicar una receta). `activar=false` solo
// apaga la regla existente (activa:false), no la borra -- coherente con
// cómo ya funciona el toggle "Activa" del editor avanzado.
export function aplicarReceta(reglasActuales: Regla[], receta: Receta, columnas: Columna[], valor: string, activar: boolean): Regla[] {
  const existente = reglasActuales.find((r) => receta.coincideCon(r, columnas));
  if (!activar) {
    return existente ? reglasActuales.map((r) => (r.id === existente.id ? { ...r, activa: false } : r)) : reglasActuales;
  }
  const construida = receta.construir(columnas, valor);
  if (!construida) return reglasActuales;
  if (existente) {
    return reglasActuales.map((r) => (r.id === existente.id ? { ...construida, id: existente.id } : r));
  }
  return [...reglasActuales, { ...construida, id: crypto.randomUUID() }];
}
