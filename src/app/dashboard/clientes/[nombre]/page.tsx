import FichaCliente from "@/components/FichaCliente";

export default async function FichaClientePage({ params }: { params: Promise<{ nombre: string }> }) {
  const { nombre } = await params;
  return <FichaCliente nombre={decodeURIComponent(nombre)} />;
}
