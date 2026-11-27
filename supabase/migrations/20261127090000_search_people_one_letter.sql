-- Buscar personas desde la primera letra (antes, 3). Decisión de producto: la búsqueda en «Invitar empleado» responde
-- ni bien se escribe. Mismos permisos que antes: dueña del negocio (o quien crea el primero), cuentas confirmadas, de a 5.
-- Igual que 20261110160000_search_people_first_business.sql salvo el mínimo de letras.
CREATE OR REPLACE FUNCTION private.search_people(p_business uuid, p_query text, p_page integer DEFAULT 1)
 RETURNS TABLE(id uuid, email text, first_name text, last_name text, avatar_url text, by_email boolean, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_email text;
  v_name text;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  -- Sin negocio: quien crea el primero (todavía no es dueña de ninguno) busca a su equipo. Ver el encabezado.
  if v_query = ''
    or (p_business is null and exists (select 1 from public.businesses b where b.owner_id = (select auth.uid())))
    or (p_business is not null and not private.is_owner(p_business)) then
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
        and (p_business is null or not exists (select 1 from public.employees e where e.business_id = p_business and e.person_id = p.id))
    )
    select f.id,
           case when f.by_email then f.email else private.mask_email(f.email) end,
           f.first_name, f.last_name, f.avatar_url, f.by_email, count(*) over ()
    from found f
    order by f.by_email desc, private.fold(f.first_name), private.fold(f.last_name), f.id
    limit 5 offset (least(greatest(coalesce(p_page, 1), 1), 1000) - 1) * 5;
end;
$function$

;
