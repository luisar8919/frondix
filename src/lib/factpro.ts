const FACTPRO_API = "https://api.factpro.la/api/v3";

// Multi-tenant: cada negocio de Frondix tiene su PROPIA empresa/RUC en FactPro,
// con su propio token de empresa (guardado por quien llama esta función, ej. en
// la fila de `empresas`). Por eso el token nunca sale de un env var fijo acá --
// se recibe como parámetro en cada llamada. La única excepción es `crearEmpresa`,
// que usa el token de USUARIO (el de la cuenta de Frondix en FactPro, distinto
// del token de cada empresa), porque ese endpoint es el único que lo requiere.
async function factproFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${FACTPRO_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const body = await res.json();
  // FactPro no es consistente: unos endpoints devuelven {mensaje}, otros
  // {errors: [{message}]} (ej. "RUC ya registrado", "tipo documento incorrecto").
  if (!res.ok || body?.exito === false) throw new Error(body?.mensaje || body?.errors?.[0]?.message || "Error de FactPro");
  return body;
}

// Crea la empresa (RUC) en FactPro y devuelve su token de empresa -- guardarlo
// junto al negocio en la DB, es lo que se pasa al resto de las funciones de acá.
// Después de esto, el RUC igual necesita el trámite de Alta de PSE en SUNAT
// Operaciones en Línea (lo hace el propio dueño del negocio, con su clave SOL --
// Frondix nunca debe pedir ni tocar esa clave) antes de poder emitir en producción;
// SUNAT lo activa recién al día siguiente del registro.
export async function crearEmpresa(ruc: string, nombre: string, nombreComercial?: string) {
  // Si se manda nombre_comercial, FactPro exige mínimo 6 caracteres -- un string
  // vacío cuenta como "mandado" y lo rechaza, así que se omite el campo entero
  // en vez de mandar "".
  return factproFetch("/empresas", process.env.FACTPRO_USER_TOKEN!, {
    method: "POST",
    body: JSON.stringify({ identificacion: ruc, nombre, pais: "2", ...(nombreComercial ? { nombre_comercial: nombreComercial } : {}) }),
  });
}

// Catálogo 08 de FactPro (OJO: no es el código SUNAT -- SUNAT factura=01/boleta=03,
// FactPro usa su propio código interno para /series).
export const FACTPRO_TIPO_DOCUMENTO = { factura: 7, boleta: 8 } as const;

// Máximo 4 caracteres, prefijo según tipo (F.../B.../FC.../BC.../FD.../BD.../T...).
export async function crearSerie(
  tokenEmpresa: string,
  tipoDocumento: number,
  serie: string,
  sucursalId: string,
  numeroAComenzar = 1
) {
  return factproFetch("/series", tokenEmpresa, {
    method: "POST",
    body: JSON.stringify({ tipo_documento: tipoDocumento, serie, numero_a_comenzar: numeroAComenzar, sucursal: sucursalId }),
  });
}

// ubigeoId: código INEI de 6 dígitos (departamento+provincia+distrito).
export async function crearSucursal(
  tokenEmpresa: string,
  datos: { codigoAnexo: string; direccion: string; ubigeoId: string; nombre?: string; correo?: string }
) {
  return factproFetch("/sucursal", tokenEmpresa, {
    method: "POST",
    body: JSON.stringify({
      nombre: datos.nombre ?? "Sede principal",
      codigo_anexo: datos.codigoAnexo,
      direccion: datos.direccion,
      ubigeo_id: datos.ubigeoId,
      correo_electronico: datos.correo ?? "",
    }),
  });
}

// FactPro no documenta el body de respuesta de crearSucursal ni garantiza una
// sucursal por defecto al crear la empresa -- su propio soporte recomienda
// listar primero y crear solo si no hay ninguna (ver GET /sucursal, campo `id`
// dentro de `docs`). Usar esta función para obtener el `sucursalId` que pide
// crearSerie, en vez de asumir un id fijo.
export async function listarSucursales(tokenEmpresa: string): Promise<{ id: number; nombre: string }[]> {
  const res = await factproFetch("/sucursal", tokenEmpresa, { method: "GET" });
  return res.docs ?? [];
}

// Toda empresa nueva arranca en demo; esto la pasa a producción (SUNAT real).
// Hacerlo recién después de que el PSE esté activo (día siguiente al Alta de PSE).
export async function cambiarEntorno(tokenEmpresa: string, entorno: "demo" | "produccion") {
  return factproFetch("/empresas/entorno", tokenEmpresa, {
    method: "PUT",
    body: JSON.stringify({ entorno: entorno === "produccion" ? 2 : 1 }),
  });
}

interface ItemComprobante {
  descripcion: string;
  cantidad: number;
  precio: number;
  unidad?: string; // Catálogo de unidades de medida (default "NIU" = unidad)
  tipoTax?: string; // Catálogo 07: "1" = gravado IGV (default)
  incluyeTax?: boolean; // el precio ya incluye IGV (default true)
}

interface DatosCliente {
  tipoDocumento: string; // Catálogo 06 de FactPro (NO el código SUNAT): "1"=DNI, "4"=RUC -- confirmado por prueba real, "6" (código SUNAT de RUC) da "El tipo documento del cliente es incorrecto"
  numeroDocumento: string;
  denominacion: string;
  direccion?: string;
  email?: string;
  telefono?: string;
}

function armarBody(serie: string, numero: number | "#", cliente: DatosCliente, items: ItemComprobante[]) {
  return {
    serie,
    numero,
    tipo_operacion: "1", // Catálogo 51: venta interna
    enviar_automaticamente_al_cliente: false,
    cliente: {
      cliente_tipo_documento: cliente.tipoDocumento,
      cliente_numero_documento: cliente.numeroDocumento,
      cliente_denominacion: cliente.denominacion,
      cliente_direccion: cliente.direccion ?? "",
      cliente_email: cliente.email ?? "",
      cliente_telefono: cliente.telefono ?? "",
    },
    items: items.map((i) => ({
      unidad: i.unidad ?? "NIU",
      codigo: "",
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio: i.precio,
      incluye_tax: i.incluyeTax ?? true,
      tipo_tax: i.tipoTax ?? "1",
      descuento: 0,
    })),
    condicion_de_pago: [{ tipo_de_condicion: "0", forma_de_pago: "0", monto: 0 }],
    observaciones: "",
    formato_pdf: "a4",
  };
}

// Factura (serie empieza con F) y boleta (serie empieza con B) van al MISMO
// endpoint -- FactPro decide el tipo de comprobante por el prefijo de la serie,
// no hay un campo "tipo" separado. `numero: "#"` le pide a FactPro el correlativo
// siguiente automático; pasar un número fijo solo si se lleva la numeración aparte.
export async function emitirComprobante(
  tokenEmpresa: string,
  serie: string,
  cliente: DatosCliente,
  items: ItemComprobante[],
  numero: number | "#" = "#"
) {
  return factproFetch("/documentos", tokenEmpresa, {
    method: "POST",
    body: JSON.stringify(armarBody(serie, numero, cliente, items)),
  });
}

// descripcion_estado típico: REGISTRADO -> ACEPTADO (o RECHAZADO) tras que SUNAT procesa.
export async function consultarDocumento(tokenEmpresa: string, serie: string, numero: number) {
  return factproFetch("/consulta", tokenEmpresa, {
    method: "POST",
    body: JSON.stringify({ serie, numero }),
  });
}

// cdr (constancia de recepción de SUNAT) viene vacío hasta que el estado sea ACEPTADO.
export async function recuperarCdr(tokenEmpresa: string, serie: string, numero: number) {
  return factproFetch("/documentos/cdr", tokenEmpresa, {
    method: "POST",
    body: JSON.stringify({ serie, numero }),
  });
}
