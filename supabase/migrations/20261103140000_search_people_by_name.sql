-- Invitar buscando por nombre o por correo.
-- Por correo (prefijo) se ve el correo completo, como antes. Por nombre se ve enmascarado («an•••@gmail.com»):
-- así nadie junta correos buscando nombres comunes. Elegir a alguien encontrado por nombre invita por su cuenta
-- (person_id) y el correo lo pone la base. Mismos límites: solo la dueña de ese negocio, desde 3 caracteres,
-- cuentas confirmadas, sin ella misma ni quienes ya están en el equipo, de a 5 por página.

drop function public.search_people(uuid, text, integer);
drop function private.search_people(uuid, text, integer);

-- Minúsculas y sin tildes, para que «jose» encuentre a «José» y «nunez» a «Núñez».
create function private.fold(p_text text) returns text
language sql immutable set search_path = ''
as $$ select translate(lower(coalesce(p_text, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou') $$;

-- «ana.perez@gmail.com» → «an•••@gmail.com».
create function private.mask_email(p_email text) returns text
language sql immutable set search_path = ''
as $$ select left(split_part(p_email, '@', 1), 2) || '•••@' || split_part(p_email, '@', 2) $$;

create function private.search_people(p_business uuid, p_query text, p_page integer default 1)
returns table (id uuid, email text, first_name text, last_name text, avatar_url text, by_email boolean, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_email text;
  v_name text;
begin
  if length(v_query) < 3 or not private.is_owner(p_business) then
    return;
  end if;
  -- Escapa los comodines de LIKE en lo que escribió la dueña.
  v_email := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_name := replace(replace(replace(private.fold(v_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    with found as (
      select p.id, p.email, p.first_name, p.last_name, p.avatar_url, lower(p.email) like v_email as by_email
      from public.profiles p
      join auth.users u on u.id = p.id and u.email_confirmed_at is not null
      where (
          lower(p.email) like v_email
          -- Cualquier palabra del nombre completo, o varias seguidas («ana pe»).
          or ' ' || private.fold(btrim(p.first_name || ' ' || p.last_name)) like '% ' || v_name
        )
        and p.id <> (select auth.uid())
        and not exists (select 1 from public.employees e where e.business_id = p_business and e.person_id = p.id)
    )
    select f.id,
           case when f.by_email then f.email else private.mask_email(f.email) end,
           f.first_name, f.last_name, f.avatar_url, f.by_email, count(*) over ()
    from found f
    order by f.by_email desc, private.fold(f.first_name), private.fold(f.last_name), f.id
    limit 5 offset (least(greatest(coalesce(p_page, 1), 1), 1000) - 1) * 5;
end;
$$;

create function public.search_people(p_business uuid, p_query text, p_page integer default 1)
returns table (id uuid, email text, first_name text, last_name text, avatar_url text, by_email boolean, total bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.search_people(p_business, p_query, p_page) $$;

revoke execute on function private.fold(text) from public, anon;
grant execute on function private.fold(text) to authenticated;
revoke execute on function private.mask_email(text) from public, anon;
grant execute on function private.mask_email(text) to authenticated;
revoke execute on function private.search_people(uuid, text, integer) from public, anon;
grant execute on function private.search_people(uuid, text, integer) to authenticated;
revoke execute on function public.search_people(uuid, text, integer) from public, anon;
grant execute on function public.search_people(uuid, text, integer) to authenticated;

-- Al invitar: por correo, como antes; o por cuenta (person_id, sin correo), cuando se eligió a alguien
-- encontrado por nombre. La cuenta tiene que existir y la invitación queda pendiente hasta que la acepte.
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
    select u.id into new.person_id from auth.users u
    where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null;
    if new.person_id is null then
      raise exception 'No hay ninguna cuenta de Caja Simple con ese correo. Pídele que se registre primero.' using errcode = 'P0001';
    end if;
  end if;
  if exists (select 1 from public.businesses b where b.id = new.business_id and b.owner_id = new.person_id) then
    raise exception 'Ya eres la dueña de este negocio.' using errcode = 'P0001';
  end if;
  new.status := 'invitado';
  return new;
end;
$$;
