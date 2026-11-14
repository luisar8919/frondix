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
  aplicaA: (columnas: Columna[], nombre: string) => boolean;
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
    icono: "📦",
    titulo: "Ajustar Stock automáticamente",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Cada venta o compra descuenta o suma la Cantidad real en el Stock enlazado.",
    aplicaA: (columnas, nombre) => {
      const tipo = tipoModulo(columnas.map((c) => c.rol), nombre);
      return (tipo === "ventas" || tipo === "compras") && !!col(columnas, "producto")?.enlace;
    },
    construir: () => ({ activa: true, origen: "automatica", condicion: { tipo: "siempre" }, accion: { tipo: "ajustar_stock" } }),
    coincideCon: (r) => r.accion.tipo === "ajustar_stock",
    extraerValor: () => "",
  },
  {
    clave: "aviso_registro_grande",
    icono: "🔔",
    titulo: "Avisarme en registros grandes",
    tipoValor: "numero",
    valorPorDefecto: "500",
    descripcion: (v) => `Te avisamos cuando el Monto de un registro supere ${v}.`,
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
    clave: "aviso_eliminacion",
    icono: "🗑️",
    titulo: "Avisarme si se elimina un registro",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Te avisamos apenas se borra cualquier fila de este módulo.",
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
    icono: "🚫",
    titulo: "No contar los cancelados en Reportes",
    tipoValor: "texto",
    valorPorDefecto: "Cancelado",
    descripcion: (v) => `Si el Estado queda en "${v}", no se suma como ingreso en Reportes.`,
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
    icono: "🔄",
    titulo: "Completar Cliente si queda vacío",
    tipoValor: "texto",
    valorPorDefecto: "Cliente mostrador",
    descripcion: (v) => `Si no se escribe un Cliente, se completa solo con "${v}".`,
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
    icono: "👀",
    titulo: "Activar Seguimiento de clientes solo",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Cada registro nuevo activa el seguimiento de ese cliente (avisa si deja de comprar).",
    aplicaA: (columnas) => !!col(columnas, "cliente"),
    construir: () => ({ activa: true, origen: "manual", evento: ["creacion"], condicion: { tipo: "siempre" }, accion: { tipo: "agregar_seguimiento" } }),
    coincideCon: (r) => r.accion.tipo === "agregar_seguimiento" && r.condicion.tipo === "siempre",
    extraerValor: () => "",
  },
  {
    clave: "stock_bajo",
    icono: "⚠️",
    titulo: "Avisarme cuando el Stock esté por agotarse",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Avisa cuando la Cantidad de un producto llega a su Stock mínimo.",
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
    clave: "eliminar_si_negativo",
    icono: "🧹",
    titulo: "Borrar producto si su Cantidad queda negativa",
    tipoValor: "ninguno",
    valorPorDefecto: "",
    descripcion: () => "Elimina el producto del Stock si su Cantidad queda por debajo de 0 (dato inconsistente).",
    aplicaA: (columnas) => esStock(columnas),
    construir: () => ({
      activa: true, origen: "manual", evento: ["modificacion"],
      condicion: { tipo: "campo", columnaKey: "cantidad", operador: "menor", valor: "0" },
      accion: { tipo: "eliminar_registro" },
    }),
    coincideCon: (r) => r.accion.tipo === "eliminar_registro" && r.condicion.tipo === "campo" && r.condicion.columnaKey === "cantidad" && r.condicion.operador === "menor" && r.condicion.valor === "0",
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
