-- La empleada cambia el turno que tiene asignado (desde Tu cuenta), sin esperar a la dueña; a ella le llega un aviso.
-- Solo su propia ficha activa y solo a un turno vigente de su sucursal. La sucursal y el puesto los sigue
-- cambiando la dueña en Empleados.
create function private.change_my_shift(p_employee uuid, p_shift uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_emp public.employees;
  v_owner uuid;
  v_from text;
  v_to text;
begin
  -- Security definer salta RLS, y con ella la política de la verificación en dos pasos: se exige aquí.
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;

  select * into v_emp from public.employees e
  where e.id = p_employee and e.person_id = (select auth.uid()) and e.status = 'activo'
  for update;
  if v_emp.id is null then
    raise exception 'No encontramos tu ficha en ese negocio.' using errcode = '42501';
  end if;

  select s.name into v_to from public.shifts s
  where s.id = p_shift and s.branch_id = v_emp.branch_id and s.archived_at is null;
  if v_to is null then
    raise exception 'Ese turno no es de tu sucursal o ya no existe.' using errcode = 'P0001';
  end if;
  if v_emp.shift_id = p_shift then
    return;
  end if;

  select s.name into v_from from public.shifts s where s.id = v_emp.shift_id;
  update public.employees set shift_id = p_shift where id = v_emp.id;

  select b.owner_id into v_owner from public.businesses b where b.id = v_emp.business_id;
  perform private.notify(v_owner, 'shift_change', v_emp.business_id, v_emp.id, jsonb_build_object(
    'person', private.full_name(v_emp.person_id),
    'business', (select b.name from public.businesses b where b.id = v_emp.business_id),
    'branch', (select br.name from public.branches br where br.id = v_emp.branch_id),
    'from', v_from,
    'to', v_to
  ));
end;
$$;

create function public.change_my_shift(p_employee uuid, p_shift uuid)
returns void
language sql security invoker set search_path = ''
as $$ select private.change_my_shift(p_employee, p_shift) $$;

revoke execute on function private.change_my_shift(uuid, uuid) from public, anon;
grant execute on function private.change_my_shift(uuid, uuid) to authenticated;
revoke execute on function public.change_my_shift(uuid, uuid) from public, anon;
grant execute on function public.change_my_shift(uuid, uuid) to authenticated;
