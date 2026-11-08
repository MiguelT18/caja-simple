-- Cada negocio paga su propio plan, así que una persona puede tener los negocios que quiera (también en Gratis).
-- Y el cobro sale de los locales que la dueña elige al pagar, no solo de los que ya tiene.

drop trigger businesses_check_free on public.businesses;
drop function private.check_free_business();

-- Traspaso: sin el límite de un negocio Gratis por persona.
create or replace function private.transfer_ownership(p_employee uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_emp public.employees;
  v_business public.businesses;
  v_me_profile public.profiles;
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

-- Cobro por locales: p_branches son los que elige (nunca menos de los que ya tiene). 1 local = Negocio; más = Sucursales.
drop function public.create_plan_charge(uuid, public.plan, public.plan_period, public.charge_method);
drop function private.create_plan_charge(uuid, public.plan, public.plan_period, public.charge_method);

create function private.create_plan_charge(p_business uuid, p_branches integer, p_period public.plan_period, p_method public.charge_method)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_branches integer;
  v_plan public.plan;
  v_extra integer;
  v_rate record;
  v_settings public.billing_settings;
  v_usd numeric;
  v_id uuid;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if not private.is_owner(p_business) then
    raise exception 'Solo la dueña del negocio puede pagar su plan.' using errcode = '42501';
  end if;
  if p_branches is null or p_branches < 1 or p_branches > 20 then
    raise exception 'Elige de 1 a 20 locales.' using errcode = 'P0001';
  end if;
  -- Bloquea el negocio: dos pedidos a la vez no crean dos cobros.
  perform 1 from public.businesses b where b.id = p_business for update;
  select greatest(p_branches, count(*)::integer) into v_branches from public.branches br where br.business_id = p_business;
  v_plan := case when v_branches > 1 then 'Sucursales' else 'Negocio' end;
  v_extra := v_branches - 1;

  select c.id into v_id from public.plan_charges c
  where c.business_id = p_business and c.plan = v_plan and c.period = p_period and c.method = p_method
    and c.extra_branches = v_extra and c.paid_at is null and c.expires_at > now()
  order by c.created_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select * into v_rate from private.current_rate();
  if v_rate.usd_bob is null then
    raise exception 'Todavía no tenemos el tipo de cambio del BCB. Intenta en unos minutos o escríbenos.' using errcode = 'P0001';
  end if;
  select * into v_settings from public.billing_settings;
  v_usd := private.plan_usd(v_plan, p_period, v_extra);

  insert into public.plan_charges (business_id, plan, period, extra_branches, usd, rate, rate_date, tax_rate, amount_bs, method, expires_at)
  values (p_business, v_plan, p_period, v_extra, v_usd, v_rate.usd_bob, v_rate.rate_date, v_settings.tax_rate,
          private.bs_total(v_usd, v_rate.usd_bob, v_settings.tax_rate), p_method, now() + make_interval(days => v_settings.charge_days))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.create_plan_charge(p_business uuid, p_branches integer, p_period public.plan_period, p_method public.charge_method)
returns uuid
language sql security invoker set search_path = ''
as $$ select private.create_plan_charge(p_business, p_branches, p_period, p_method) $$;

revoke execute on function private.create_plan_charge(uuid, integer, public.plan_period, public.charge_method),
  public.create_plan_charge(uuid, integer, public.plan_period, public.charge_method) from public, anon;
grant execute on function private.create_plan_charge(uuid, integer, public.plan_period, public.charge_method),
  public.create_plan_charge(uuid, integer, public.plan_period, public.charge_method) to authenticated;
