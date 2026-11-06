-- Equipo de una sucursal (/app/<negocio>/sucursales/<sucursal>/equipo): la dueña del negocio y las fichas activas
-- de esa sucursal, con nombre, foto, puesto y turno. Sin correos: por eso es una función y no se abre la política de
-- employees, que dejaría ver el correo de cada compañera. Las invitaciones pendientes no aparecen.
create function private.branch_team(p_branch uuid)
returns table (person_id uuid, first_name text, last_name text, avatar_url text, job_title text, shift_id uuid, is_owner boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  -- Security definer salta RLS, y con ella la política de la verificación en dos pasos: se exige aquí.
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if not private.can_use_branch(p_branch) then
    raise exception 'No tienes acceso a esa sucursal.' using errcode = '42501';
  end if;
  return query
    select p.id, p.first_name, p.last_name, p.avatar_url, null::text, null::uuid, true
    from public.branches br
    join public.businesses b on b.id = br.business_id
    join public.profiles p on p.id = b.owner_id
    where br.id = p_branch
    union all
    select p.id, p.first_name, p.last_name, p.avatar_url, e.job_title, e.shift_id, false
    from public.employees e
    join public.profiles p on p.id = e.person_id
    where e.branch_id = p_branch and e.status = 'activo'
    order by 7 desc, 2, 3;
end;
$$;

create function public.branch_team(p_branch uuid)
returns table (person_id uuid, first_name text, last_name text, avatar_url text, job_title text, shift_id uuid, is_owner boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.branch_team(p_branch) $$;

revoke execute on function private.branch_team(uuid), public.branch_team(uuid) from public, anon;
grant execute on function private.branch_team(uuid), public.branch_team(uuid) to authenticated;
