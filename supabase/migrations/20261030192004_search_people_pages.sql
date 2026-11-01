-- Sugerencias al invitar, de a 5 por página y con el total para paginar.
-- Mismos límites que search_people: solo la dueña de ese negocio, desde 3 caracteres, por prefijo,
-- cuentas confirmadas, sin ella misma ni quienes ya están en el equipo.
drop function public.search_people(uuid, text);
drop function private.search_people(uuid, text);

create function private.search_people(p_business uuid, p_query text, p_page integer default 1)
returns table (id uuid, email text, first_name text, last_name text, avatar_url text, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
begin
  if length(v_query) < 3 or not private.is_owner(p_business) then
    return;
  end if;
  return query
    select p.id, p.email, p.first_name, p.last_name, p.avatar_url, count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id and u.email_confirmed_at is not null
    where lower(p.email) like replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      and p.id <> (select auth.uid())
      and not exists (select 1 from public.employees e where e.business_id = p_business and e.person_id = p.id)
    order by lower(p.email)
    limit 5 offset (least(greatest(coalesce(p_page, 1), 1), 1000) - 1) * 5;
end;
$$;

create function public.search_people(p_business uuid, p_query text, p_page integer default 1)
returns table (id uuid, email text, first_name text, last_name text, avatar_url text, total bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.search_people(p_business, p_query, p_page) $$;

revoke execute on function private.search_people(uuid, text, integer) from public, anon;
grant execute on function private.search_people(uuid, text, integer) to authenticated;
revoke execute on function public.search_people(uuid, text, integer) from public, anon;
grant execute on function public.search_people(uuid, text, integer) to authenticated;
