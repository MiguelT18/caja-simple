-- Logo o foto del negocio (Configuración › Negocio). Va al bucket branch-images como <business_id>/<business_id>.<ext>:
-- las políticas de ese bucket ya dejan verla a los miembros y subirla, cambiarla o borrarla solo a la dueña.
alter table public.businesses add column image_path text
  check (image_path is null or image_path like id::text || '/%');

grant update (image_path) on public.businesses to authenticated;
