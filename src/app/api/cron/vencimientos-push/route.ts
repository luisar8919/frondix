import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";
import { enviarCorreo } from "@/lib/email";
import type { Columna } from "@/lib/excel-parser";
import { leerTodasLasFilas } from "@/lib/paginacion";

// Revisa cualquier módulo con una columna "Fecha de vencimiento" (rol
// fecha_vencimiento, ver roles.ts) junto a una columna "producto" --
// cubre tanto Stock físico (botica/veterinaria) como Membresías/Alquileres/
// Matrículas (donde "producto" es el plan/propiedad/curso que vence, ver
// plantillasModulo.ts) -- y manda UN push + correo por empresa listando lo
// que vence dentro de UMBRAL_DIAS o venció hace poco. Dispara un cron externo (GitHub
// Actions, ver .github/workflows/vencimientos-push.yml) con el secreto en el
// header x-cron-secret, mismo patrón que /api/cron/seguimiento-push.
const UMBRAL_DIAS_ANTES = 7;
const TOLERANCIA_DIAS_VENCIDO = 3;

function diasHasta(fechaStr: unknown, ahora: Date): number | null {
  const f = new Date(String(fechaStr));
  if (isNaN(f.getTime())) return null;
  return Math.round((f.getTime() - ahora.getTime()) / 86400000);
}

export async function GET(req: NextRequest) {
  const secreto = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secreto");
  if (!process.env.CRON_SECRET || secreto !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = crearClienteAdmin();
  const ahora = new Date();

  const { data: datasets, error } = await supabase.from("datasets").select("id, empresa_id, columnas");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const relevantes = (datasets ?? []).filter((d) => {
    const cols = d.columnas as Columna[];
    return cols.some((c) => c.rol === "producto") && cols.some((c) => c.rol === "fecha_vencimiento");
  });

  // nombre de producto -> días (el más urgente si hay varios lotes), agrupado por empresa.
  const avisosPorEmpresa = new Map<string, { producto: string; dias: number }[]>();
  let datasetsConError = 0;

  for (const d of relevantes) {
    try {
      const columnas = d.columnas as Columna[];
      const cProducto = columnas.find((c) => c.rol === "producto")!;
      const cVencimiento = columnas.find((c) => c.rol === "fecha_vencimiento")!;

      const filas = await leerTodasLasFilas<{ id: string; data: Record<string, unknown> }>((desde, hasta) =>
        supabase.from("records").select("id, data").eq("dataset_id", d.id).is("eliminado_en", null).order("id").range(desde, hasta)
      );

      const { data: yaAvisados } = await supabase
        .from("vencimientos_avisados")
        .select("record_id, fecha_avisada")
        .eq("dataset_id", d.id);
      const avisadoPorId = new Map((yaAvisados ?? []).map((a) => [a.record_id, a.fecha_avisada]));

      for (const r of filas) {
        const fechaRaw = r.data[cVencimiento.key];
        if (!fechaRaw) continue;
        const dias = diasHasta(fechaRaw, ahora);
        if (dias === null || dias > UMBRAL_DIAS_ANTES || dias < -TOLERANCIA_DIAS_VENCIDO) continue;
        if (avisadoPorId.get(r.id) === String(fechaRaw)) continue; // mismo lote/fecha ya avisado

        const lista = avisosPorEmpresa.get(d.empresa_id) ?? [];
        lista.push({ producto: String(r.data[cProducto.key] ?? "producto"), dias });
        avisosPorEmpresa.set(d.empresa_id, lista);
        await supabase.from("vencimientos_avisados").upsert({ record_id: r.id, dataset_id: d.id, fecha_avisada: String(fechaRaw) });
      }
    } catch (e) {
      datasetsConError++;
      console.error(`vencimientos-push: fallo en el dataset ${d.id}:`, e instanceof Error ? e.message : e);
    }
  }

  let empresasConError = 0;
  for (const [empresaId, items] of avisosPorEmpresa) {
    try {
      const { data: miembros } = await supabase.from("miembros").select("user_id").eq("empresa_id", empresaId);
      const userIds = (miembros ?? []).map((m) => m.user_id);
      const { data: empresa } = await supabase.from("empresas").select("nombre").eq("id", empresaId).single();
      const nombres = items.map((i) => (i.dias < 0 ? `${i.producto} (vencido)` : i.dias === 0 ? `${i.producto} (vence hoy)` : `${i.producto} (en ${i.dias}d)`));
      const titulo = items.length === 1 ? "Un producto está por vencer" : `${items.length} productos están por vencer`;
      const cuerpo = nombres.length <= 3
        ? `${nombres.join(", ")} en ${empresa?.nombre ?? "tu negocio"}.`
        : `${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} más.`;
      await enviarPush(supabase, userIds, titulo, cuerpo, { tipo: "vencimiento_proximo" });

      const filasHtml = items
        .map((i) => {
          const estado = i.dias < 0 ? "<strong style='color:#c0392b;'>vencido</strong>" : i.dias === 0 ? "<strong style='color:#c0392b;'>vence hoy</strong>" : `vence en ${i.dias} día${i.dias === 1 ? "" : "s"}`;
          return `<li style="margin-bottom: 6px;">${i.producto} — ${estado}</li>`;
        })
        .join("");
      const asunto = items.length === 1
        ? `Frondix: "${items[0].producto}" está por vencer`
        : `Frondix: ${items.length} productos de ${empresa?.nombre ?? "tu negocio"} están por vencer`;
      await enviarCorreo(
        supabase,
        userIds,
        asunto,
        `<p>Hola,</p>
         <p>En <strong>${empresa?.nombre ?? "tu negocio"}</strong> esto necesita tu atención pronto:</p>
         <ul style="padding-left: 18px;">${filasHtml}</ul>
         <p>Revísalo antes de la fecha para no perder el producto o el pago.</p>`
      );
    } catch (e) {
      empresasConError++;
      console.error(`vencimientos-push: fallo al notificar a la empresa ${empresaId}:`, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    datasetsRevisados: relevantes.length,
    avisos: [...avisosPorEmpresa.values()].reduce((s, l) => s + l.length, 0),
    empresasNotificadas: avisosPorEmpresa.size - empresasConError,
    empresasConError,
    datasetsConError,
  });
}
