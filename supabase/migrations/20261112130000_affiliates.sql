-- Programa de afiliados: socios aprobados a mano (contadores, distribuidores…) recomiendan Caja Simple con su link
-- /r/<código> y ganan un % de lo que pagan los negocios referidos durante 12 meses desde su primer pago. El negocio
-- referido tiene un descuento en su primer cobro (no se suma al de fundador: se aplica el mayor).
-- Ver docs/planes-de-suscripcion.md › Afiliados.

-- Afiliados: solo los da de alta un administrador con SQL. Cada uno con su %.
create table public.affiliates (
  id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(code) between 3 and 30),
  rate numeric(3, 2) not null default 0.30 check (rate > 0 and rate <= 0.5),
  active boolean not null default true,
  -- Cómo se le paga (banco, cuenta, QR). Lo carga el administrador.
  payout_details text,
  created_at timestamptz not null default now()
);
alter table public.affiliates enable row level security;
create policy "El afiliado ve su ficha" on public.affiliates for select to authenticated
  using (id = (select auth.uid()));
create policy "Exige la verificación en dos pasos" on public.affiliates as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.affiliates from anon, authenticated;
grant select on public.affiliates to authenticated;

-- Quién recomendó a la persona y, copiado al crear el negocio, a cada negocio suyo (si el negocio se transfiere, la
-- comisión no cambia de afiliado). Sin grant de insert ni update: solo claim_referral y el trigger los escriben.
alter table public.profiles add column referred_by uuid references public.affiliates (id) on delete set null;
alter table public.businesses add column referred_by uuid references public.affiliates (id) on delete set null;
create index profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;
create index businesses_referred_by_idx on public.businesses (referred_by) where referred_by is not null;

alter table public.billing_settings
  add column referral_discount numeric(3, 2) not null default 0.20 check (referral_discount >= 0 and referral_discount < 1),
  add column referral_months integer not null default 12 check (referral_months > 0),
  add column referral_hold_days integer not null default 30 check (referral_hold_days >= 0);
comment on column public.billing_settings.referral_discount is 'Descuento del primer cobro de un negocio referido. No se suma al de fundador: se aplica el mayor.';
comment on column public.billing_settings.referral_months is 'Meses desde el primer pago del negocio referido durante los que su afiliado cobra comisión.';
comment on column public.billing_settings.referral_hold_days is 'Días desde el pago del cliente hasta que la comisión se puede pagar.';

-- De dónde viene el descuento del cobro, para mostrarlo y para que el de recomendación no ocupe cupo de fundador.
alter table public.plan_charges
  add column discount_reason text check (discount_reason in ('fundador', 'referido'));
update public.plan_charges set discount_reason = 'fundador' where discount > 0;

-- Una comisión por cobro pagado de un negocio referido. Guarda el nombre del negocio: el afiliado no lo ve por RLS.
create table public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  -- El cobro y el negocio pueden borrarse (al borrar el negocio); la comisión queda.
  charge_id uuid unique references public.plan_charges (id) on delete set null,
  business_id uuid references public.businesses (id) on delete set null,
  business_name text not null,
  charge_bs integer not null check (charge_bs > 0),
  rate numeric(3, 2) not null,
  -- Meses del cobro dentro de la ventana de comisión (1 en mensual; en anual, los que le quedan, hasta 12).
  months smallint not null check (months between 1 and 12),
  amount_bs integer not null check (amount_bs >= 0),
  created_at timestamptz not null default now(),
  payable_at timestamptz not null,
  paid_out_at timestamptz,
  payout_ref text
);
create index referral_commissions_affiliate_idx on public.referral_commissions (affiliate_id, created_at desc);
create index referral_commissions_business_idx on public.referral_commissions (business_id);
alter table public.referral_commissions enable row level security;
create policy "El afiliado ve sus comisiones" on public.referral_commissions for select to authenticated
  using (affiliate_id = (select auth.uid()));
create policy "Exige la verificación en dos pasos" on public.referral_commissions as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.referral_commissions from anon, authenticated;
grant select on public.referral_commissions to authenticated;

-- Atribución --------------------------------------------------------------------------------------------------------

-- Al crear la cuenta con la cookie del link: la persona queda referida por ese afiliado. Solo si es una cuenta nueva
-- (menos de 7 días), sin referido todavía, que no es el propio afiliado y que nunca pagó un plan. Devuelve si quedó.
create function public.claim_referral(p_code text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_affiliate uuid;
begin
  select a.id into v_affiliate from public.affiliates a where a.code = lower(btrim(p_code)) and a.active;
  if v_affiliate is null or v_affiliate = auth.uid() then
    return false;
  end if;
  if exists (
    select 1 from public.plan_charges c join public.businesses b on b.id = c.business_id
    where b.owner_id = auth.uid() and c.paid_at is not null
  ) then
    return false;
  end if;
  update public.profiles p set referred_by = v_affiliate
  where p.id = auth.uid() and p.referred_by is null and p.created_at > now() - interval '7 days';
  return found;
end;
$$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

create function private.copy_referral() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select p.referred_by into new.referred_by from public.profiles p where p.id = new.owner_id;
  return new;
end;
$$;
create trigger businesses_copy_referral before insert on public.businesses
  for each row execute function private.copy_referral();

-- Cobro: el descuento de recomendación en el primer cobro ----------------------------------------------------------

-- Igual que en 20261112120000_no_tax_and_founder_annual.sql, más el descuento de recomendación: en el primer cobro
-- de un negocio referido (ninguno pagado), si es mayor que el de fundador, se aplica ese (sobre el cobro entero).
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
  if v_discount > 0 then
    v_reason := 'fundador';
  end if;
  -- Recomendación: solo el primer cobro, solo si da más que el de fundador. Cubre el cobro entero (también el anual).
  if v_referred_by is not null and v_settings.referral_discount > v_discount
    and not exists (select 1 from public.plan_charges c where c.business_id = p_business and c.paid_at is not null) then
    v_discount := v_settings.referral_discount;
    v_reason := 'referido';
    v_months := null;
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

-- Activación: la comisión del afiliado ------------------------------------------------------------------------------

-- Meses de [p_from, p_end) que cubre un cobro: en mensual, 1 si p_from es antes de p_end; en anual, los meses que
-- quedan hasta p_end (los empezados cuentan enteros), hasta 12. 0: fuera de la ventana.
create function private.commission_months(p_period public.plan_period, p_from date, p_end date) returns smallint
language sql immutable set search_path = ''
as $$
  select case
    when p_from >= p_end then 0
    when p_period = 'mensual' then 1
    else (select least(12, extract(year from x) * 12 + extract(month from x) + case when extract(day from x) > 0 then 1 else 0 end)
          from age(p_end, p_from) x)
  end::smallint
$$;

-- Igual que en 20261108170000_free_plan_limits.sql, más: el descuento de recomendación no ocupa cupo de fundador, y
-- si el negocio fue referido por un afiliado activo, su comisión sobre lo cobrado en Bs durante la ventana.
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

  -- Comisión: la ventana empieza el día del primer pago del negocio (este, si es el primero).
  select * into v_affiliate from public.affiliates a where a.id = v_business.referred_by and a.active;
  if v_affiliate.id is not null then
    select * into v_settings from public.billing_settings;
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

-- Solo un administrador, con SQL, al pagarle al afiliado: marca pagadas sus comisiones ya liberadas y devuelve el total.
create function private.pay_commissions(p_affiliate uuid, p_ref text) returns integer
language sql security definer set search_path = ''
as $$
  with paid as (
    update public.referral_commissions set paid_out_at = now(), payout_ref = p_ref
    where affiliate_id = p_affiliate and paid_out_at is null and payable_at <= now()
    returning amount_bs
  )
  select coalesce(sum(amount_bs), 0)::integer from paid
$$;

-- Cuántas cuentas y negocios refirió el afiliado (sin datos de ellos: el afiliado no ve perfiles ajenos).
create function public.affiliate_referrals() returns table (people integer, businesses integer, paying integer)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*)::integer from public.profiles p where p.referred_by = auth.uid()),
    (select count(*)::integer from public.businesses b where b.referred_by = auth.uid()),
    (select count(distinct c.business_id)::integer from public.referral_commissions c where c.affiliate_id = auth.uid())
  where private.mfa_ok()
$$;

revoke execute on function private.copy_referral(), private.commission_months(public.plan_period, date, date),
  private.activate_plan_charge(uuid), private.pay_commissions(uuid, text) from public, anon, authenticated;
revoke execute on function public.affiliate_referrals() from public, anon;
grant execute on function public.affiliate_referrals() to authenticated;
