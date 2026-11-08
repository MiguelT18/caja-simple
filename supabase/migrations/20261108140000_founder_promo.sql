-- Precio fundador: los primeros {founder_slots} negocios que pagan tienen {founder_discount} de descuento durante
-- {founder_months} meses desde su primer pago. Se configura en billing_settings; el cupo se ocupa al activar el pago.
-- Ver docs/planes-de-suscripcion.md › Precio fundador.

alter table public.billing_settings
  add column founder_active boolean not null default true,
  add column founder_slots integer not null default 20 check (founder_slots >= 0),
  add column founder_discount numeric(3, 2) not null default 0.5 check (founder_discount >= 0 and founder_discount < 1),
  add column founder_months integer not null default 12 check (founder_months > 0);

-- Sin grant de update: solo activate_plan_charge lo escribe.
alter table public.businesses add column founder_since date;
create index businesses_founder_idx on public.businesses (founder_since) where founder_since is not null;

alter table public.plan_charges
  add column discount numeric(3, 2) not null default 0 check (discount >= 0 and discount < 1);

-- Cupos que quedan, para la barra (también sin sesión): solo conteos, ningún dato de negocios.
-- Con p_business (y siendo su dueña), además hasta cuándo ese negocio tiene el precio fundador.
create function public.founder_promo(p_business uuid default null)
returns table (active boolean, slots integer, taken integer, discount numeric, months integer, founder_until date)
language sql stable security definer set search_path = ''
as $$
  select s.founder_active, s.founder_slots,
    (select count(*)::integer from public.businesses b where b.founder_since is not null),
    s.founder_discount, s.founder_months,
    (select (b.founder_since + make_interval(months => s.founder_months))::date - 1
       from public.businesses b
       where p_business is not null and b.id = p_business and b.founder_since is not null and private.is_owner(b.id))
  from public.billing_settings s
$$;

revoke execute on function public.founder_promo(uuid) from public;
grant execute on function public.founder_promo(uuid) to anon, authenticated;

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
  v_founder_since date;
  v_left integer;
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
  select b.founder_since into v_founder_since from public.businesses b where b.id = p_business for update;
  select * into v_settings from public.billing_settings;
  -- Precio fundador: el negocio ya fundador dentro de su año, o uno nuevo mientras queden cupos.
  if v_founder_since is not null then
    if v_founder_since + make_interval(months => v_settings.founder_months) > private.today() then
      v_discount := v_settings.founder_discount;
    end if;
  elsif v_settings.founder_active then
    select v_settings.founder_slots - count(*) into v_left from public.businesses b where b.founder_since is not null;
    if v_left > 0 then
      v_discount := v_settings.founder_discount;
    end if;
  end if;
  select greatest(p_branches, count(*)::integer) into v_branches from public.branches br where br.business_id = p_business;
  v_plan := case when v_branches > 1 then 'Sucursales' else 'Negocio' end;
  v_extra := v_branches - 1;

  select c.id into v_id from public.plan_charges c
  where c.business_id = p_business and c.plan = v_plan and c.period = p_period and c.method = p_method
    and c.extra_branches = v_extra and c.discount = v_discount and c.paid_at is null and c.expires_at > now()
  order by c.created_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select * into v_rate from private.current_rate();
  if v_rate.usd_bob is null then
    raise exception 'Todavía no tenemos el tipo de cambio del BCB. Intenta en unos minutos o escríbenos.' using errcode = 'P0001';
  end if;
  v_usd := round(private.plan_usd(v_plan, p_period, v_extra) * (1 - v_discount), 2);

  insert into public.plan_charges (business_id, plan, period, extra_branches, discount, usd, rate, rate_date, tax_rate, amount_bs, method, expires_at)
  values (p_business, v_plan, p_period, v_extra, v_discount, v_usd, v_rate.usd_bob, v_rate.rate_date, v_settings.tax_rate,
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
  v_start date;
begin
  select * into v_charge from public.plan_charges c where c.id = p_charge for update;
  if v_charge.id is null then
    raise exception 'No existe el cobro %.', p_charge;
  end if;
  if v_charge.paid_at is not null then
    raise exception 'El cobro % ya se marcó pagado el %.', p_charge, v_charge.paid_at;
  end if;
  select * into v_business from public.businesses b where b.id = v_charge.business_id for update;
  v_start := case
    when v_business.plan = v_charge.plan and v_business.plan_until >= private.today() then v_business.plan_until + 1
    else private.today()
  end;

  update public.businesses
  set plan = v_charge.plan,
      plan_until = (v_start + case v_charge.period when 'mensual' then interval '1 month' else interval '1 year' end)::date - 1
  where id = v_charge.business_id;
  -- El primer pago con descuento ocupa el cupo de fundador (desde hoy cuenta su año).
  if v_charge.discount > 0 and v_business.founder_since is null then
    update public.businesses set founder_since = private.today() where id = v_charge.business_id;
  end if;
  update public.plan_charges set paid_at = now() where id = p_charge;
end;
$$;
