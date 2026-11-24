-- Correr esto una vez en Supabase > SQL Editor
-- Límite mensual de comprobantes por empresa (tope duro + paquetes extra comprados).
-- factpro_ciclo guarda "YYYY-MM" del mes al que corresponden documentos_usados/extra --
-- al cambiar el mes, el código resetea ambos a 0 (ver src/lib/limiteFacturacion.ts).
alter table empresas add column if not exists factpro_limite_base integer not null default 200;
alter table empresas add column if not exists factpro_documentos_usados integer not null default 0;
alter table empresas add column if not exists factpro_extra_mes integer not null default 0;
alter table empresas add column if not exists factpro_ciclo text;
