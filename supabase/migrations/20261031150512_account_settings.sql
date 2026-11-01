-- Tu cuenta: perfil editable, foto propia, verificación en dos pasos y notificaciones push.
-- Ver docs/modelo-de-datos.md («Tu cuenta»).

-- Perfil: el correo sale de auth.users (trigger on_auth_user_updated); la persona edita nombre y foto.
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, avatar_url) on public.profiles to authenticated;

-- Fotos de perfil: públicas para mostrarlas en el panel, el combo de invitar y Empleados sin URLs firmadas.
-- Cada quien escribe solo en su carpeta: avatars/<uid>/<archivo>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Subir tu foto de perfil" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Reemplazar tu foto de perfil" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Borrar tu foto de perfil" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Suscripciones push: una por navegador o dispositivo donde la persona activó los avisos.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

create policy "Ver tus suscripciones push" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Crear tus suscripciones push" on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Actualizar tus suscripciones push" on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Borrar tus suscripciones push" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Cada aviso nuevo se manda también por push: pg_net llama a la Edge Function send-push (asíncrono).
-- La URL del proyecto y el secreto viven en Vault (project_url, push_webhook_secret); sin ellos no se manda nada.
create extension if not exists pg_net with schema extensions;

create function private.push_notification() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('user_id', new.user_id, 'kind', new.kind, 'data', new.data)
  );
  return new;
end;
$$;

create trigger notifications_push after insert on public.notifications
  for each row execute function private.push_notification();

-- Verificación en dos pasos: si la persona tiene un factor verificado, su sesión tiene que estar en aal2
-- para leer o escribir cualquier cosa. Es una política restrictiva en cada tabla: toda tabla nueva la lleva también.
create function private.mfa_ok() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
$$;

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'create policy "Exige la verificación en dos pasos" on public.%I as restrictive for all to authenticated
         using ((select private.mfa_ok())) with check ((select private.mfa_ok()))', t);
  end loop;
end
$$;

create policy "Exige la verificación en dos pasos" on storage.objects as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

revoke execute on function private.push_notification() from public, anon, authenticated;
revoke execute on function private.mfa_ok() from public, anon;
grant execute on function private.mfa_ok() to authenticated;
