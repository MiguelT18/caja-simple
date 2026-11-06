-- Ayuda y comentarios: hasta 5 capturas o imágenes por mensaje.
-- Bucket privado feedback-images/<uid>/<archivo>: cada quien sube solo a su carpeta y nadie las lee desde la app
-- (igual que los mensajes); se ven en el panel de Supabase. La política restrictiva de la 2FA ya cubre storage.objects.

alter table public.feedback
  add column images text[] not null default '{}' check (cardinality(images) <= 5);
grant insert (images) on public.feedback to authenticated;

-- Las rutas tienen que estar en la carpeta de quien envía.
drop policy "Enviar tus comentarios" on public.feedback;
create policy "Enviar tus comentarios" on public.feedback for insert to authenticated
  with check (
    person_id = (select auth.uid())
    and not exists (select 1 from unnest(images) as p where p not like (select auth.uid())::text || '/%')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-images', 'feedback-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Subir capturas de tus comentarios" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
