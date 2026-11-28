-- La prueba del plan Negocio deja de empezar sola al crear el primer negocio: el negocio nace en Gratis y la dueña la
-- activa cuando quiera desde la página Plan (start_trial). Sigue siendo una vez por persona (private.trials) y dura
-- referral_trial_days si el negocio llegó con el enlace de un afiliado. Los negocios que ya están en prueba siguen igual.
drop trigger businesses_start_trial on public.businesses;
drop function private.start_trial();

-- Días de prueba que la persona puede activar en este negocio, o null si no le toca: no es la dueña, el negocio ya
-- tiene un plan pago vigente, o la persona ya usó su prueba.
create function public.trial_offer(p_business uuid) returns smallint
language sql stable security definer set search_path = ''
as $$
  select case when b.referred_by is not null then s.referral_trial_days else 30::smallint end
  from public.businesses b
  cross join public.billing_settings s
  where b.id = p_business
    and private.is_owner(b.id)
    and private.effective_plan(b.id) = 'Gratis'
    and not exists (select 1 from private.trials t where t.person_id = (select auth.uid()))
$$;
revoke execute on function public.trial_offer(uuid) from public, anon;
grant execute on function public.trial_offer(uuid) to authenticated;

-- Activa la prueba en el negocio. Devuelve hasta cuándo dura (hoy incluido).
create function public.start_trial(p_business uuid) returns date
language plpgsql security definer set search_path = ''
as $$
declare
  v_days smallint := public.trial_offer(p_business);
  v_until date;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if v_days is null then
    raise exception 'Este negocio no puede activar la prueba: es solo para la dueña, en Gratis y una vez por persona.' using errcode = 'P0001';
  end if;
  -- Una sola vez por persona: si ya estaba (dos clics seguidos), no inserta.
  insert into private.trials (person_id) values ((select auth.uid())) on conflict do nothing;
  if not found then
    raise exception 'Ya usaste tu prueba gratis del plan Negocio.' using errcode = 'P0001';
  end if;
  update public.businesses
  set plan = 'Negocio', plan_until = private.today() + v_days - 1, trial = true
  where id = p_business
  returning plan_until into v_until;
  return v_until;
end;
$$;
revoke execute on function public.start_trial(uuid) from public, anon;
grant execute on function public.start_trial(uuid) to authenticated;
