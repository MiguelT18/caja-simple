-- Sin NIT todavía: el cobro no suma impuestos. El total en bolivianos es el precio en dólares por el tipo de cambio,
-- redondeado (private.bs_total con tasa 0). Al inscribirse ante el SIN, tax_rate pasa a 0.05 (SIETE-RG) o 0.16
-- (régimen General) y la app vuelve a mostrar la línea de impuestos sola. Ver docs/planes-de-suscripcion.md.
update public.billing_settings set tax_rate = 0;
alter table public.billing_settings alter column tax_rate set default 0;
comment on column public.billing_settings.tax_rate is
  '0 mientras no haya NIT. Al inscribirse: 0.05 si es SIETE-RG, 0.16 (IVA 13% + IT 3%, sobre el total facturado) si es el régimen General. Confirmarla con un contador.';

-- Precio fundador en el plan anual: el descuento cubre solo los meses de fundador que le quedan al negocio (antes, si
-- el período seguía vigente el día del cobro, el año entero iba con descuento). null: mensual o sin descuento.
alter table public.plan_charges
  add column discount_months smallint check (discount_months between 1 and 12);
comment on column public.plan_charges.discount_months is
  'Cobro anual con precio fundador: cuántos de los 12 meses llevan el descuento. null en los mensuales y sin descuento.';

-- Igual que en 20261108140000_founder_promo.sql, con el descuento anual prorrateado.
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
  select b.founder_since into v_founder_since from public.businesses b where b.id = p_business for update;
  select * into v_settings from public.billing_settings;
  -- Precio fundador: el negocio ya fundador dentro de su año, o uno nuevo mientras queden cupos.
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
    select v_settings.founder_slots - count(*) into v_left from public.businesses b where b.founder_since is not null;
    if v_left > 0 then
      v_discount := v_settings.founder_discount;
      -- Fundador nuevo: su período empieza al pagar, así que el año entero va con descuento.
      if p_period = 'anual' then
        v_months := least(12, v_settings.founder_months);
      end if;
    end if;
  end if;
  select greatest(p_branches, count(*)::integer) into v_branches from public.branches br where br.business_id = p_business;
  v_plan := case when v_branches > 1 then 'Sucursales' else 'Negocio' end;
  v_extra := v_branches - 1;

  select c.id into v_id from public.plan_charges c
  where c.business_id = p_business and c.plan = v_plan and c.period = p_period and c.method = p_method
    and c.extra_branches = v_extra and c.discount = v_discount
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

  insert into public.plan_charges (business_id, plan, period, extra_branches, discount, discount_months, usd, rate, rate_date, tax_rate, amount_bs, method, expires_at)
  values (p_business, v_plan, p_period, v_extra, v_discount, v_months, v_usd, v_rate.usd_bob, v_rate.rate_date, v_settings.tax_rate,
          private.bs_total(v_usd, v_rate.usd_bob, v_settings.tax_rate), p_method, now() + make_interval(days => v_settings.charge_days))
  returning id into v_id;
  return v_id;
end;
$$;
