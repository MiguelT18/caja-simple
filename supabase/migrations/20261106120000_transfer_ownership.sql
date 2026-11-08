-- Pasar la propiedad de un negocio a alguien del equipo. Solo la dueña, en el acto (la app le pide confirmarlo).
-- La dueña anterior toma el lugar de la nueva en el equipo: misma sucursal y turno; la nueva dueña puede moverla
-- o quitarla después. La nueva dueña recibe un aviso. El plan y sus datos siguen con el negocio.

alter type public.notification_kind add value if not exists 'ownership';

create function private.transfer_ownership(p_employee uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_emp public.employees;
  v_business public.businesses;
  v_me_profile public.profiles;
  v_free text;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_emp from public.employees e where e.id = p_employee for update;
  if v_emp.id is null or not private.is_owner(v_emp.business_id) then
    raise exception 'Solo quien administra el negocio puede pasar la propiedad.' using errcode = '42501';
  end if;
  if v_emp.status <> 'activo' or v_emp.person_id is null then
    raise exception 'Solo se puede pasar a alguien que ya aceptó la invitación al equipo.' using errcode = 'P0001';
  end if;
  if v_emp.person_id = v_me then
    raise exception 'Ya eres la dueña de este negocio.' using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses b where b.id = v_emp.business_id for update;
  -- El mismo límite que al crear un negocio (private.check_free_business): uno en Gratis por persona.
  if v_business.plan = 'Gratis' then
    select b.name into v_free from public.businesses b
    where b.owner_id = v_emp.person_id and b.plan = 'Gratis' and b.id <> v_business.id limit 1;
    if v_free is not null then
      raise exception 'Esa persona ya tiene un negocio en el plan Gratis («%»). Pasa este negocio a un plan pago antes de traspasarlo.', v_free
        using errcode = 'P0001';
    end if;
  end if;

  select * into v_me_profile from public.profiles p where p.id = v_me;
  -- Una ficha vieja con el correo de la dueña (de antes de ser dueña) chocaría con el índice único por correo.
  delete from public.employees e
  where e.business_id = v_business.id and lower(e.email) = lower(v_me_profile.email) and e.id <> v_emp.id;

  update public.businesses set owner_id = v_emp.person_id where id = v_business.id;
  update public.employees
  set person_id = v_me,
      email = v_me_profile.email,
      first_name = coalesce(nullif(btrim(v_me_profile.first_name), ''), split_part(v_me_profile.email, '@', 1)),
      last_name = v_me_profile.last_name,
      job_title = ''
  where id = v_emp.id;

  perform private.notify(v_emp.person_id, 'ownership', v_business.id, null, jsonb_build_object(
    'business', v_business.name,
    'person', private.full_name(v_me)
  ));
end;
$$;

create function public.transfer_ownership(p_employee uuid) returns void
language sql security invoker set search_path = ''
as $$ select private.transfer_ownership(p_employee) $$;

revoke execute on function private.transfer_ownership(uuid) from public, anon;
grant execute on function private.transfer_ownership(uuid) to authenticated;
revoke execute on function public.transfer_ownership(uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid) to authenticated;
