import type { EmpresaDeUsuario } from "./sesion.ts";

// "vendedor": solo registra ventas y consulta stock -- sin ver costos, compras,
// reportes financieros, ni poder subir/editar módulos o gestionar el equipo.
// Es el único rol restringido; dueno/admin/miembro siguen viendo todo (la
// distinción entre esos tres es solo sobre quién puede invitar gente, ver
// /api/team). Centralizado acá para no repetir el mismo if en cada ruta.
export function esVendedor(rol: string | undefined | null): boolean {
  return rol === "vendedor";
}

export function rolEnEmpresa(empresas: EmpresaDeUsuario[], empresaId: string): string | undefined {
  return empresas.find((e) => e.empresaId === empresaId)?.rol;
}
