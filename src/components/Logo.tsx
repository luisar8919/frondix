import Link from "next/link";

// Marca: un brote sobre fondo verde (crecimiento) + el nombre.
export function LogoMarca({ tamano = 32 }: { tamano?: number }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 32 32" role="img" aria-label="Frondix" style={{ flex: "none" }}>
      <rect width="32" height="32" rx="9" fill="#237a50" />
      <path d="M16 25V15" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M16 17C11 17 8.5 14.5 8.5 10.5C13 10.5 16 13 16 17Z" fill="#fff" />
      <path d="M16 14.5C16 10 19 7.5 23.5 7.5C23.5 11.5 20.5 14.5 16 14.5Z" fill="#bfe3ce" />
    </svg>
  );
}

export default function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="Frondix, ir al inicio">
      <LogoMarca />
      <span className="logo-texto">Frondix</span>
    </Link>
  );
}
