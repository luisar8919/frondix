import type { EmpresaDeUsuario } from "./sesion.ts";

// "vendedor": solo registra ventas y consulta stock -- sin ver costos, compras,
// reportes financieros, ni poder subir/editar módulos o gestionar el equipo.
// dueno/admin/miembro siguen viendo todo (la distinción entre esos tres es
// solo sobre quién puede invitar gente, ver /api/team). Centralizado acá para
// no repetir el mismo if en cada ruta.
export function esVendedor(rol: string | undefined | null): boolean {
  return rol === "vendedor";
}

// "mozo" (migración 45): el mesero que abre una mesa y toma pedidos en el
// Punto de Venta -- ni más ni menos acceso a datos de negocio que un
// vendedor (ver rolRestringido), pero además sin Resumen/Seguimiento/
// Configuración en la barra (eso sí es específico de BarraPanel, no de acá).
export function esMozo(rol: string | undefined | null): boolean {
  return rol === "mozo";
}

// Gate compartido por los ~30 endpoints/páginas que hoy solo chequeaban
// esVendedor() para bloquear costos/compras/reportes/clientes-proveedores/etc:
// un mozo debe quedar igual de afuera de todo eso, sin repetir el OR en cada
// archivo. Usar esVendedor()/esMozo() sueltos solo donde el texto en pantalla
// de verdad distingue entre los 2 roles (ej. BarraPanel).
export function rolRestringido(rol: string | undefined | null): boolean {
  return esVendedor(rol) || esMozo(rol);
}

export function rolEnEmpresa(empresas: EmpresaDeUsuario[], empresaId: string): string | undefined {
  return empresas.find((e) => e.empresaId === empresaId)?.rol;
}
