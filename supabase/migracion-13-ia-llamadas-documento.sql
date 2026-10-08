-- Correr una vez en Supabase > SQL Editor. No borra ningun dato.
-- "Sugerir con IA" al subir Excel ahora limita 3 veces al dia POR DOCUMENTO (antes
-- era 10/hora por empresa, compartido con highlights) -- se identifica el documento
-- por su nombre de archivo, que es lo unico estable que el cliente manda en cada
-- intento (nada se guarda hasta confirmar la carga).

alter table ia_llamadas add column if not exists documento text;
