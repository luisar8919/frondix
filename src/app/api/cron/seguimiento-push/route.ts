import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { agruparClientes, diasDesde, type FilaCruda } from "@/lib/seguimiento";
import { enviarPush } from "@/lib/push";
import type { Columna } from "@/lib/excel-parser";

// Revisa los clientes con seguimiento activado (checkbox en la pantalla de
// Seguimiento) y manda UN push por empresa listando a los que recién cruzaron
// el umbral de "no volvió" -- "recién" porque solo se avisa una vez por cada
// vez que el cliente se queda callado (ultima_fecha_cliente/notificado_en en
// seguimiento_clientes): si vuelve a comprar y después se vuelve a quedar
// callado, se le puede volver a avisar. Lo dispara un cron externo (GitHub
// Actions, ver .github/workflows/seguimiento-push.yml) con el secreto en el
// header x-cron-secret -- sin él, cualquiera podría gastar las notificaciones.
const UMBRAL_DIAS = 30;
const PAGINA = 1000;
const TOPE_FILAS = 20000;

async function leerFilas(supabase: ReturnType<typeof crearClienteAdmin>, datasetId: string, claveCliente: string, claveFecha: string) {
  const seleccion = `c:data->>${claveCliente},f:data->>${claveFecha}`;
  const filas: FilaCruda[] = [];
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await supabase.from("records").select(seleccion).eq("dataset_id", datasetId).order("id").range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data as unknown as FilaCruda[]));
    if (data.length < PAGINA) break;
  }
  return filas;
}

export async function GET(req: NextRequest) {
  const secreto = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secreto");
  if (!process.env.CRON_SECRET || secreto !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = crearClienteAdmin();
  const ahora = new Date();

  const { data: activados, error: errorActivados } = await supabase
    .from("seguimiento_clientes")
    .select("id, empresa_id, dataset_id, cliente_clave, cliente_nombre, ultima_fecha_cliente, notificado_en")
    .eq("activo", true);
  if (errorActivados) return NextResponse.json({ error: errorActivados.message }, { status: 500 });
  if (!activados || activados.length === 0) return NextResponse.json({ revisados: 0, avisos: 0 });

  // Un dataset puede tener varios clientes activados -- se lee cada dataset una sola vez.
  const porDataset = new Map<string, typeof activados>();
  for (const a of activados) {
    const lista = porDataset.get(a.dataset_id) ?? [];
    lista.push(a);
    porDataset.set(a.dataset_id, lista);
  }

  // nombres que recién cruzaron el umbral, agrupados por empresa, para mandar UN push combinado.
  const caducadosPorEmpresa = new Map<string, string[]>();
  let avisosPendientes = 0;

  for (const [datasetId, filasActivadas] of porDataset) {
    const { data: dataset } = await supabase.from("datasets").select("columnas").eq("id", datasetId).single();
    if (!dataset) continue;
    const columnas = dataset.columnas as Columna[];
    const cCliente = columnas.find((c) => c.rol === "cliente");
    const cFecha = columnas.find((c) => c.rol === "fecha" && c.tipo === "fecha");
    if (!cCliente || !cFecha) continue;

    const filas = await leerFilas(supabase, datasetId, cCliente.key, cFecha.key);
    const porClave = new Map(agruparClientes(filas).map((c) => [c.clave, c]));

    for (const a of filasActivadas) {
      const actual = porClave.get(a.cliente_clave);
      const ultimaFecha = actual?.ultimaFecha ?? null;

      // Compró algo nuevo desde la última vez que se revisó: vuelve a estar
      // "activo", se resetea el aviso para poder notificar de nuevo si se
      // vuelve a quedar callado más adelante.
      if (ultimaFecha !== a.ultima_fecha_cliente) {
        await supabase.from("seguimiento_clientes").update({ ultima_fecha_cliente: ultimaFecha, notificado_en: null }).eq("id", a.id);
        continue;
      }

      const dias = diasDesde(ultimaFecha, ahora);
      if (dias === null || dias < UMBRAL_DIAS) continue;
      if (a.notificado_en) continue; // ya se avisó de este mismo período sin volver

      avisosPendientes++;
      const lista = caducadosPorEmpresa.get(a.empresa_id) ?? [];
      lista.push(a.cliente_nombre);
      caducadosPorEmpresa.set(a.empresa_id, lista);
      await supabase.from("seguimiento_clientes").update({ notificado_en: ahora.toISOString() }).eq("id", a.id);
    }
  }

  for (const [empresaId, nombres] of caducadosPorEmpresa) {
    const { data: miembros } = await supabase.from("miembros").select("user_id").eq("empresa_id", empresaId);
    const userIds = (miembros ?? []).map((m) => m.user_id);
    const { data: empresa } = await supabase.from("empresas").select("nombre").eq("id", empresaId).single();
    const titulo = nombres.length === 1 ? "Un cliente no volvió" : `${nombres.length} clientes no volvieron`;
    const cuerpo = nombres.length <= 3
      ? `${nombres.join(", ")} llevan ${UMBRAL_DIAS}+ días sin comprar en ${empresa?.nombre ?? "tu negocio"}.`
      : `${nombres.slice(0, 2).join(", ")} y ${nombres.length - 2} más llevan ${UMBRAL_DIAS}+ días sin comprar.`;
    await enviarPush(supabase, userIds, titulo, cuerpo, { tipo: "seguimiento_caducado" });
  }

  return NextResponse.json({ revisados: activados.length, avisos: avisosPendientes, empresasNotificadas: caducadosPorEmpresa.size });
}
