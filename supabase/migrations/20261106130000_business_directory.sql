-- Buscar negocios y pedir unirse. Cada negocio tiene una descripción (obligatoria al crearlo; los de antes la agregan
-- al volver a guardar) y aparece en Buscar solo si la dueña lo activa (listed). En Buscar se ve el nombre, el rubro,
-- la descripción, el logo y las sucursales con su dirección; nunca ventas, caja ni equipo. Quien pide unirse espera
-- la respuesta; la dueña acepta eligiendo sucursal, turno y puesto, y la persona entra activa al equipo.

-- Negocio -----------------------------------------------------------------

alter table public.businesses
  add column description text check (description is null or char_length(btrim(description)) between 10 and 400),
  add column listed boolean not null default false,
  add constraint businesses_listed_needs_description check (not listed or description is not null);

grant update (description, listed) on public.businesses to authenticated;

drop function public.create_business(text, text, text, text, text, jsonb, public.business_kind);
create function public.create_business(
  p_name text, p_slug text, p_branch_name text, p_branch_slug text, p_branch_address text, p_shifts jsonb,
  p_kind public.business_kind default 'tienda', p_description text default null, p_listed boolean default false
) returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_business uuid;
  v_branch uuid;
begin
  if jsonb_typeof(p_shifts) <> 'array' or jsonb_array_length(p_shifts) = 0 then
    raise exception 'Agrega al menos un turno' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Escribe una descripción del negocio.' using errcode = 'P0001';
  end if;
  insert into public.businesses (name, slug, kind, description, listed)
  values (btrim(p_name), p_slug, p_kind, btrim(p_description), coalesce(p_listed, false)) returning id into v_business;
  insert into public.branches (business_id, name, slug, address)
  values (v_business, btrim(p_branch_name), p_branch_slug, coalesce(btrim(p_branch_address), ''))
  returning id into v_branch;
  insert into public.shifts (branch_id, name, start_time, end_time, tone)
  select v_branch, btrim(s ->> 'name'), (s ->> 'start')::time, (s ->> 'end')::time, (s ->> 'tone')::public.shift_tone
  from jsonb_array_elements(p_shifts) s;

  if p_kind = 'ropa' then
    with types as (
      insert into public.products (business_id, name)
      select v_business, t from unnest(array['Prenda', 'Polera', 'Pantalón', 'Chamarra']) t
      returning id
    )
    insert into public.inventory (business_id, branch_id, product_id, price, stock, min_stock)
    select v_business, v_branch, id, null, null, null from types;
  end if;
  return p_slug;
end;
$$;

revoke execute on function public.create_business(text, text, text, text, text, jsonb, public.business_kind, text, boolean) from public, anon;
grant execute on function public.create_business(text, text, text, text, text, jsonb, public.business_kind, text, boolean) to authenticated;

-- Pedidos para unirse -----------------------------------------------------

alter type public.notification_kind add value if not exists 'join_request';
alter type public.notification_kind add value if not exists 'join_answer';

create type public.join_status as enum ('pendiente', 'aceptada', 'rechazada');

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  person_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- La sucursal que sugiere quien pide; null si le da igual.
  branch_id uuid references public.branches (id) on delete set null,
  message text check (char_length(message) <= 300),
  -- Copiados al pedir: la dueña no puede leer el perfil de alguien que no está en su equipo.
  person_name text not null,
  person_email text not null,
  status public.join_status not null default 'pendiente',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index join_requests_one_pending_idx on public.join_requests (business_id, person_id) where status = 'pendiente';
create index join_requests_business_idx on public.join_requests (business_id, created_at desc);
create index join_requests_person_idx on public.join_requests (person_id);
create index join_requests_branch_idx on public.join_requests (branch_id);
create index join_requests_decided_by_idx on public.join_requests (decided_by);

alter table public.join_requests enable row level security;
create policy "Ver tus pedidos y los de tus negocios" on public.join_requests for select to authenticated
  using (person_id = (select auth.uid()) or (select private.is_owner(business_id)));
create policy "Exige la verificación en dos pasos" on public.join_requests as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Se escribe solo con las funciones de abajo.
revoke all on public.join_requests from anon, authenticated;
grant select on public.join_requests to authenticated;

alter table public.notifications
  add column join_request_id uuid references public.join_requests (id) on delete cascade;
create index notifications_join_request_idx on public.notifications (join_request_id);

-- Buscar: solo los negocios en la lista y con descripción. 12 por página, con el total en cada fila.
create function private.search_businesses(p_query text, p_kind public.business_kind, p_page integer)
returns table (
  id uuid, name text, kind public.business_kind, description text, image_path text, branches jsonb, relation text, total bigint
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_pattern text := '%' || replace(replace(replace(coalesce(btrim(p_query), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if v_me is null or not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  return query
  with found as (
    select b.* from public.businesses b
    where b.listed and b.description is not null
      and (p_kind is null or b.kind = p_kind)
      and (
        b.name ilike v_pattern or b.description ilike v_pattern
        or exists (select 1 from public.branches br where br.business_id = b.id and (br.name ilike v_pattern or br.address ilike v_pattern))
      )
  )
  select f.id, f.name, f.kind, f.description, f.image_path,
    (select coalesce(jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name, 'address', br.address) order by br.created_at), '[]'::jsonb)
     from public.branches br where br.business_id = f.id),
    case
      when f.owner_id = v_me then 'dueño'
      when exists (select 1 from public.employees e where e.business_id = f.id and e.person_id = v_me and e.status = 'activo') then 'equipo'
      when exists (select 1 from public.employees e where e.business_id = f.id and e.person_id = v_me) then 'invitado'
      when exists (select 1 from public.join_requests r where r.business_id = f.id and r.person_id = v_me and r.status = 'pendiente') then 'pendiente'
    end,
    count(*) over ()
  from found f
  order by f.name, f.id
  limit 12 offset (greatest(coalesce(p_page, 1), 1) - 1) * 12;
end;
$$;

create function private.request_join(p_business uuid, p_branch uuid, p_message text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_business public.businesses;
  v_profile public.profiles;
  v_request uuid;
  v_message text := nullif(btrim(p_message), '');
begin
  if v_me is null or not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_business from public.businesses b where b.id = p_business;
  if v_business.id is null or not v_business.listed then
    raise exception 'Ese negocio ya no recibe pedidos.' using errcode = 'P0001';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches br where br.id = p_branch and br.business_id = p_business) then
    raise exception 'Esa sucursal no es de este negocio.' using errcode = 'P0001';
  end if;
  if v_business.owner_id = v_me then
    raise exception 'Este negocio ya es tuyo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.employees e where e.business_id = p_business and e.person_id = v_me and e.status = 'activo') then
    raise exception 'Ya trabajas en este negocio.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.employees e where e.business_id = p_business and e.person_id = v_me) then
    raise exception 'Ya te invitaron: acéptala en tus avisos.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.join_requests r where r.business_id = p_business and r.person_id = v_me and r.status = 'pendiente') then
    raise exception 'Ya pediste unirte. Espera la respuesta de quien administra el negocio.' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles p where p.id = v_me;
  insert into public.join_requests (business_id, person_id, branch_id, message, person_name, person_email)
  values (p_business, v_me, p_branch, v_message, private.full_name(v_me), v_profile.email)
  returning id into v_request;

  insert into public.notifications (user_id, kind, business_id, join_request_id, data)
  values (v_business.owner_id, 'join_request', p_business, v_request, jsonb_build_object(
    'person', private.full_name(v_me),
    'business', v_business.name,
    'slug', v_business.slug,
    'branch', (select br.name from public.branches br where br.id = p_branch),
    'message', v_message
  ));
  return v_request;
end;
$$;

-- Responder: solo la dueña. Al aceptar elige sucursal, turno y puesto; la persona entra activa (ver link_invited_employee).
create function private.answer_join(p_request uuid, p_accept boolean, p_branch uuid, p_shift uuid, p_job_title text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.join_requests;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_request from public.join_requests r where r.id = p_request for update;
  if v_request.id is null or not private.is_owner(v_request.business_id) then
    raise exception 'Solo quien administra el negocio responde estos pedidos.' using errcode = '42501';
  end if;
  if v_request.status <> 'pendiente' then
    raise exception 'Ese pedido ya se respondió.' using errcode = 'P0001';
  end if;

  update public.join_requests
  set status = case when p_accept then 'aceptada'::public.join_status else 'rechazada' end,
      decided_by = (select auth.uid()), decided_at = now()
  where id = p_request;

  if p_accept then
    if not exists (
      select 1 from public.shifts s join public.branches br on br.id = s.branch_id
      where s.id = p_shift and br.id = p_branch and br.business_id = v_request.business_id
    ) then
      raise exception 'Ese turno es de otra sucursal. Elige uno de la sucursal seleccionada.' using errcode = 'P0001';
    end if;
    if coalesce(btrim(p_job_title), '') = '' then
      raise exception 'Escribe el puesto.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.employees e where e.business_id = v_request.business_id and e.person_id = v_request.person_id) then
      raise exception 'Esa persona ya está en tu equipo.' using errcode = 'P0001';
    end if;
    insert into public.employees (business_id, branch_id, shift_id, person_id, email, job_title)
    values (v_request.business_id, p_branch, p_shift, v_request.person_id, '', left(btrim(p_job_title), 60));
  end if;

  update public.notifications set read_at = coalesce(read_at, now())
  where join_request_id = p_request and user_id = (select auth.uid());

  perform private.notify(v_request.person_id, 'join_answer', v_request.business_id, null, jsonb_build_object(
    'accepted', p_accept,
    'business', (select b.name from public.businesses b where b.id = v_request.business_id),
    'person', private.full_name((select auth.uid()))
  ));
end;
$$;

create function public.search_businesses(p_query text default '', p_kind public.business_kind default null, p_page integer default 1)
returns table (
  id uuid, name text, kind public.business_kind, description text, image_path text, branches jsonb, relation text, total bigint
)
language sql stable security invoker set search_path = ''
as $$ select * from private.search_businesses(p_query, p_kind, p_page) $$;

create function public.request_join(p_business uuid, p_branch uuid default null, p_message text default null) returns uuid
language sql security invoker set search_path = ''
as $$ select private.request_join(p_business, p_branch, p_message) $$;

create function public.answer_join(p_request uuid, p_accept boolean, p_branch uuid default null, p_shift uuid default null, p_job_title text default null)
returns void
language sql security invoker set search_path = ''
as $$ select private.answer_join(p_request, p_accept, p_branch, p_shift, p_job_title) $$;

revoke execute on function private.search_businesses(text, public.business_kind, integer), private.request_join(uuid, uuid, text),
  private.answer_join(uuid, boolean, uuid, uuid, text) from public, anon;
grant execute on function private.search_businesses(text, public.business_kind, integer), private.request_join(uuid, uuid, text),
  private.answer_join(uuid, boolean, uuid, uuid, text) to authenticated;
revoke execute on function public.search_businesses(text, public.business_kind, integer), public.request_join(uuid, uuid, text),
  public.answer_join(uuid, boolean, uuid, uuid, text) from public, anon;
grant execute on function public.search_businesses(text, public.business_kind, integer), public.request_join(uuid, uuid, text),
  public.answer_join(uuid, boolean, uuid, uuid, text) to authenticated;

-- Al aceptar un pedido (answer_join, en la misma transacción: decided_at = now()) la persona entra activa y sin el
-- aviso de invitación: ya lo pidió ella. Una invitación de la dueña, en cualquier otra transacción, sigue igual.
create or replace function private.link_invited_employee() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.email, '') = '' and new.person_id is not null then
    select u.email into new.email from auth.users u
    where u.id = new.person_id and u.email_confirmed_at is not null;
    if new.email is null then
      raise exception 'Esa cuenta ya no está disponible. Búscala de nuevo.' using errcode = 'P0001';
    end if;
  else
    -- Sin cuenta confirmada con ese correo, person_id queda en null: se vincula al confirmar.
    select u.id into new.person_id from auth.users u
    where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null;
  end if;
  if exists (select 1 from public.businesses b where b.id = new.business_id and b.owner_id = new.person_id) then
    raise exception 'Ya eres la dueña de este negocio.' using errcode = 'P0001';
  end if;
  new.status := case
    when exists (
      select 1 from public.join_requests r
      where r.business_id = new.business_id and r.person_id = new.person_id and r.status = 'aceptada' and r.decided_at = now()
    ) then 'activo'::public.employee_status
    else 'invitado'
  end;
  return new;
end;
$$;

create or replace function private.on_employee_invited() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Entró por un pedido aceptado: no hay invitación que aceptar.
  if new.status = 'activo' then
    return new;
  end if;
  if new.person_id is not null then
    perform private.notify_invitation(new);
    return new;
  end if;
  -- Sin cuenta: el correo lo manda send-invite (asíncrono, con pg_net). Mismos secretos de Vault que send-push.
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/send-invite',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object(
      'email', new.email,
      'business', (select b.name from public.businesses b where b.id = new.business_id),
      'owner', (select private.full_name(b.owner_id) from public.businesses b where b.id = new.business_id)
    )
  );
  return new;
end;
$$;

-- Logo en Buscar ----------------------------------------------------------

create function private.listed_image(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.businesses b where b.listed and b.image_path = p_name)
$$;
revoke execute on function private.listed_image(text) from public, anon;
grant execute on function private.listed_image(text) to authenticated;

create policy "Ver logos de negocios en Buscar" on storage.objects for select to authenticated
  using (bucket_id = 'branch-images' and (select private.listed_image(name)));
