-- Fotos de fachada de las sucursales: <business_id>/<branch_id>.<ext> en un bucket privado,
-- con las mismas reglas que las fotos de productos (ver los miembros, la dueña sube, reemplaza y borra).

alter table public.branches add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branch-images', 'branch-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Ver fotos de sucursales del negocio" on storage.objects for select to authenticated
  using (bucket_id = 'branch-images' and (select private.is_member(private.folder_business(name))));
create policy "La dueña sube fotos de sucursales" on storage.objects for insert to authenticated
  with check (bucket_id = 'branch-images' and (select private.is_owner(private.folder_business(name))));
create policy "La dueña reemplaza fotos de sucursales" on storage.objects for update to authenticated
  using (bucket_id = 'branch-images' and (select private.is_owner(private.folder_business(name))))
  with check (bucket_id = 'branch-images' and (select private.is_owner(private.folder_business(name))));
create policy "La dueña borra fotos de sucursales" on storage.objects for delete to authenticated
  using (bucket_id = 'branch-images' and (select private.is_owner(private.folder_business(name))));
