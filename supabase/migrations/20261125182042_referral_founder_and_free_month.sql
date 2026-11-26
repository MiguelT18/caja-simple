-- Afiliados: el enlace asegura el precio fundador mientras dure el programa (hasta referral_founder_slots fundadores en
-- total: los 20 generales y 10 más solo para referidos). Terminado el programa, el referido ya no lleva 20% en su
-- primer cobro: su primer pago suma un mes gratis. Y el primer negocio de quien llega referido prueba 60 días.
-- Ver docs/planes-de-suscripcion.md › Afiliados.

alter table public.billing_settings
  add column referral_founder_slots integer not null default 30,
  add column referral_trial_days smallint not null default 60 check (referral_trial_days between 1 and 120),
  add column referral_free_months smallint not null default 1 check (referral_free_months between 0 and 12),
  add constraint billing_settings_referral_founder_slots_check check (referral_founder_slots >= founder_slots),
  drop column referral_discount;
comment on column public.billing_settings.referral_founder_slots is 'Tope de fundadores contando a los referidos: un negocio referido tiene precio fundador hasta este número; uno directo, hasta founder_slots.';
comment on column public.billing_settings.referral_trial_days is 'Días de prueba del primer negocio de quien llega con el enlace de un afiliado (los demás, 30).';
comment on column public.billing_settings.referral_free_months is 'Meses gratis que suma el primer pago de un negocio referido sin precio fundador.';

create or replace function private.create_plan_charge(p_business uuid, p_branches integer, p_period public.plan_period, p_method public.charge_method)
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
  v_discount numeric(3, 2) := 0;
  v_reason text;
  v_founder_since date;
  v_referred_by uuid;
  v_left integer;
  v_months smallint;
  v_end date;
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
  select b.founder_since, b.referred_by into v_founder_since, v_referred_by from public.businesses b where b.id = p_business for update;
  select * into v_settings from public.billing_settings;
  -- Precio fundador: el negocio ya fundador dentro de su año, o uno nuevo mientras queden cupos (más para un referido).
  if v_founder_since is not null then
    v_end := (v_founder_since + make_interval(months => v_settings.founder_months))::date;
    if v_end > private.today() then
      v_discount := v_settings.founder_discount;
      -- Anual: el descuento cubre solo los meses de fundador que le quedan (los empezados cuentan enteros), hasta 12.
      if p_period = 'anual' then
        select least(12, extract(year from x) * 12 + extract(month from x) + case when extract(day from x) > 0 then 1 else 0 end)::smallint
        into v_months from age(v_end, private.today()) x;
      end if;
    end if;
  elsif v_settings.founder_active then
    -- El enlace de un afiliado asegura el precio fundador: el referido tiene cupo hasta referral_founder_slots.
    select case when v_referred_by is null then v_settings.founder_slots else v_settings.referral_founder_slots end - count(*)
    into v_left from public.businesses b where b.founder_since is not null;
    if v_left > 0 then
      v_discount := v_settings.founder_discount;
      -- Fundador nuevo: su período empieza al pagar, así que el año entero va con descuento.
      if p_period = 'anual' then
        v_months := least(12, v_settings.founder_months);
      end if;
    end if;
  end if;
  if v_discount > 0 then
    v_reason := 'fundador';
  end if;
  select greatest(p_branches, count(*)::integer) into v_branches from public.branches br where br.business_id = p_business;
  v_plan := case when v_branches > 1 then 'Sucursales' else 'Negocio' end;
  v_extra := v_branches - 1;

  select c.id into v_id from public.plan_charges c
  where c.business_id = p_business and c.plan = v_plan and c.period = p_period and c.method = p_method
    and c.extra_branches = v_extra and c.discount = v_discount and c.discount_reason is not distinct from v_reason
    and c.discount_months is not distinct from v_months and c.paid_at is null and c.expires_at > now()
  order by c.created_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select * into v_rate from private.current_rate();
  if v_rate.usd_bob is null then
    raise exception 'Todavía no tenemos el tipo de cambio del BCB. Intenta en unos minutos o escríbenos.' using errcode = 'P0001';
  end if;
  -- Mensual: el descuento entero. Anual: solo sobre los meses de fundador (v_months de 12).
  v_usd := round(private.plan_usd(v_plan, p_period, v_extra) * (1 - v_discount * coalesce(v_months, 12) / 12.0), 2);

  insert into public.plan_charges (business_id, plan, period, extra_branches, discount, discount_months, discount_reason, usd, rate, rate_date, tax_rate, amount_bs, method, expires_at)
  values (p_business, v_plan, p_period, v_extra, v_discount, v_months, v_reason, v_usd, v_rate.usd_bob, v_rate.rate_date, v_settings.tax_rate,
          private.bs_total(v_usd, v_rate.usd_bob, v_settings.tax_rate), p_method, now() + make_interval(days => v_settings.charge_days))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.activate_plan_charge(p_charge uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_charge public.plan_charges;
  v_business public.businesses;
  v_settings public.billing_settings;
  v_affiliate public.affiliates;
  v_start date;
  v_first date;
  v_months smallint;
begin
  select * into v_charge from public.plan_charges c where c.id = p_charge for update;
  if v_charge.id is null then
    raise exception 'No existe el cobro %.', p_charge;
  end if;
  if v_charge.paid_at is not null then
    raise exception 'El cobro % ya se marcó pagado el %.', p_charge, v_charge.paid_at;
  end if;
  select * into v_business from public.businesses b where b.id = v_charge.business_id for update;
  -- Pagar el mismo plan antes de que venza (también durante la prueba) suma desde el día siguiente al vencimiento.
  v_start := case
    when v_business.plan = v_charge.plan and v_business.plan_until >= private.today() then v_business.plan_until + 1
    else private.today()
  end;

  update public.businesses
  set plan = v_charge.plan,
      plan_until = (v_start + case v_charge.period when 'mensual' then interval '1 month' else interval '1 year' end)::date - 1,
      trial = false
  where id = v_charge.business_id;
  -- El primer pago con precio fundador ocupa el cupo (desde hoy cuenta su año). El de recomendación, no.
  if v_charge.discount > 0 and coalesce(v_charge.discount_reason, 'fundador') = 'fundador' and v_business.founder_since is null then
    update public.businesses set founder_since = private.today() where id = v_charge.business_id;
  end if;
  select * into v_settings from public.billing_settings;
  -- Referido sin precio fundador: su primer pago suma referral_free_months meses gratis (un mes paga dos; un año, trece).
  if v_business.referred_by is not null and v_charge.discount = 0 and v_settings.referral_free_months > 0
    and not exists (select 1 from public.plan_charges c where c.business_id = v_business.id and c.paid_at is not null) then
    update public.businesses set plan_until = (plan_until + make_interval(months => v_settings.referral_free_months))::date
    where id = v_business.id;
  end if;

  -- Comisión: la ventana empieza el día del primer pago del negocio (este, si es el primero).
  select * into v_affiliate from public.affiliates a where a.id = v_business.referred_by and a.active;
  if v_affiliate.id is not null then
    select coalesce(min((c.paid_at at time zone 'America/La_Paz')::date), private.today()) into v_first
    from public.plan_charges c where c.business_id = v_business.id and c.paid_at is not null;
    v_months := private.commission_months(v_charge.period, private.today(),
      (v_first + make_interval(months => v_settings.referral_months))::date);
    if v_months > 0 then
      insert into public.referral_commissions (affiliate_id, charge_id, business_id, business_name, charge_bs, rate, months, amount_bs, payable_at)
      values (v_affiliate.id, v_charge.id, v_business.id, v_business.name, v_charge.amount_bs, v_affiliate.rate, v_months,
              round(v_charge.amount_bs * v_affiliate.rate * v_months / case v_charge.period when 'mensual' then 1 else 12 end),
              now() + make_interval(days => v_settings.referral_hold_days));
    end if;
  end if;

  update public.plan_charges set paid_at = now() where id = p_charge;
end;
$$;


create or replace function private.start_trial() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_days smallint := 30;
begin
  -- Ya la usó: el negocio nuevo queda en Gratis.
  insert into private.trials (person_id) values (new.owner_id) on conflict do nothing;
  if not found then
    return null;
  end if;
  -- Quien llega con el enlace de un afiliado prueba más días (copy_referral, before insert, ya puso referred_by).
  if new.referred_by is not null then
    select s.referral_trial_days into v_days from public.billing_settings s;
  end if;
  update public.businesses set plan = 'Negocio', plan_until = private.today() + v_days - 1, trial = true where id = new.id;
  return null;
end;
$$;

-- Cupos de la barra. Con p_referred, o con un p_business referido, los cupos son los de un referido.
drop function public.founder_promo(uuid);
create function public.founder_promo(p_business uuid default null, p_referred boolean default false)
returns table (active boolean, slots integer, taken integer, discount numeric, months integer, founder_until date, referred boolean)
language sql stable security definer set search_path = ''
as $$
  select s.founder_active,
    case when r.referred then s.referral_founder_slots else s.founder_slots end,
    (select count(*)::integer from public.businesses b where b.founder_since is not null),
    s.founder_discount, s.founder_months,
    (select (b.founder_since + make_interval(months => s.founder_months))::date - 1
       from public.businesses b
       where p_business is not null and b.id = p_business and b.founder_since is not null and private.is_owner(b.id)),
    r.referred
  from public.billing_settings s
  cross join lateral (
    select coalesce(p_referred, false) or exists (
      select 1 from public.businesses b
      where p_business is not null and b.id = p_business and b.referred_by is not null and private.is_owner(b.id)
    ) as referred
  ) r
$$;
revoke execute on function public.founder_promo(uuid, boolean) from public;
grant execute on function public.founder_promo(uuid, boolean) to anon, authenticated;
