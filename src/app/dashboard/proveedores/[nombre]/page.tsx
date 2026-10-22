import FichaProveedor from "@/components/FichaProveedor";

export default async function FichaProveedorPage({ params }: { params: Promise<{ nombre: string }> }) {
  const { nombre } = await params;
  return <FichaProveedor nombre={decodeURIComponent(nombre)} />;
}
