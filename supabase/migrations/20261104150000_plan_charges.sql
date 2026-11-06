-- Cobro de planes (docs/planes-de-suscripcion.md): el precio está en dólares sin impuestos y se cobra en bolivianos
-- con el tipo de cambio oficial del BCB del día más IVA e IT. El monto queda fijo hasta que el cobro vence; vencido,
-- uno nuevo se calcula con el tipo de cambio de ese día. El plan se activa a mano al ver el pago (activate_plan_charge).

create type public.plan_period as enum ('mensual', 'anual');
create type public.charge_method as enum ('qr', 'transferencia', 'tarjeta');

-- Tipo de cambio ----------------------------------------------------------------------------------------------------

-- Una fila por día publicado. Lo escribe solo el cron (store_rate); se lee también sin sesión (/planes).
create table public.exchange_rates (
  date date primary key,
  usd_bob numeric(10, 4) not null check (usd_bob > 0),
  source text not null,
  fetched_at timestamptz not null default now()
);

alter table public.exchange_rates enable row level security;
create policy "Ver el tipo de cambio" on public.exchange_rates for select to anon, authenticated using (true);
create policy "Exige la verificación en dos pasos" on public.exchange_rates as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.exchange_rates from anon, authenticated;
grant select on public.exchange_rates to anon, authenticated;

-- El de hoy o, si ese día no se pudo obtener, el último disponible. El cobro guarda cuál se usó (rate_date).
create function private.current_rate(out rate_date date, out usd_bob numeric)
language sql stable security definer set search_path = ''
as $$
  select r.date, r.usd_bob from public.exchange_rates r where r.date <= private.today() order by r.date desc limit 1
$$;

-- El BCB no tiene API: apibcb.cucu.bo publica su tipo de cambio oficial en JSON (sin clave, 120 consultas por hora).
-- pg_net es asíncrono: fetch_rate pide y store_rate, unos minutos después, guarda la respuesta.
create table private.rate_requests (
  id bigint primary key,
  requested_at timestamptz not null default now()
);

create function private.fetch_rate() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.rate_requests (id)
  select net.http_get(url := 'https://apibcb.cucu.bo/api/v1/tc/oficial', timeout_milliseconds := 15000);
end;
$$;

create function private.store_rate() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_tc jsonb;
begin
  select r.content::jsonb -> 'tc_oficial' into v_tc
  from private.rate_requests q
  join net._http_response r on r.id = q.id
  where r.status_code = 200
  order by q.requested_at desc
  limit 1;
  -- Sin respuesta o con un valor raro no se guarda nada: current_rate sigue con el último.
  if v_tc is not null and (v_tc ->> 'valor')::numeric > 0 and (v_tc ->> 'fecha') is not null then
    insert into public.exchange_rates (date, usd_bob, source)
    values ((v_tc ->> 'fecha')::date, (v_tc ->> 'valor')::numeric, 'BCB (vía apibcb.cucu.bo)')
    on conflict (date) do update set usd_bob = excluded.usd_bob, source = excluded.source, fetched_at = now();
  end if;
  delete from private.rate_requests where requested_at < now() - interval '7 days';
exception when others then
  raise warning 'store_rate: no se pudo leer el tipo de cambio: %', sqlerrm;
end;
$$;

-- El BCB publica el del día siguiente por la noche. 10:15 y 16:15 UTC = 06:15 y 12:15 en Bolivia (el segundo, por si
-- el primero falló); store_rate corre 5 minutos después de cada pedido.
select cron.schedule('rate-fetch', '15 10,16 * * *', 'select private.fetch_rate()');
select cron.schedule('rate-store', '20 10,16 * * *', 'select private.store_rate()');

-- Configuración del cobro -------------------------------------------------------------------------------------------

-- Una sola fila, se edita con SQL (docs/planes-de-suscripcion.md › Activar un plan tras el pago).
create table public.billing_settings (
  id boolean primary key default true check (id),
  tax_rate numeric(4, 3) not null default 0.16 check (tax_rate >= 0 and tax_rate < 1),
  charge_days integer not null default 3 check (charge_days between 1 and 30),
  qr_image_url text,
  bank_details text,
  card_note text not null default 'Te enviamos el enlace de pago con tarjeta por WhatsApp o correo, por el monto de este cobro.'
);
comment on column public.billing_settings.tax_rate is
  'IVA (13%) + IT (3%) sobre el total facturado. Confirmarla con un contador según el régimen ante el SIN. No incluye la comisión de la pasarela.';
comment on column public.billing_settings.charge_days is 'Días que el monto en bolivianos de un cobro queda fijo.';
insert into public.billing_settings default values;

alter table public.billing_settings enable row level security;
create policy "Ver la configuración del cobro" on public.billing_settings for select to anon, authenticated using (true);
create policy "Exige la verificación en dos pasos" on public.billing_settings as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.billing_settings from anon, authenticated;
-- Sin sesión solo hace falta la tasa (para el «hoy Bs …» de /planes); los datos de pago, solo con sesión.
grant select (tax_rate) on public.billing_settings to anon;
grant select on public.billing_settings to authenticated;

-- Precio y cuenta -----------------------------------------------------------------------------------------------------

-- Los precios del documento, en dólares sin impuestos. src/data/plans.ts los repite para mostrarlos
-- (plans.test.ts avisa si dejan de coincidir); el monto que se cobra sale de aquí.
create function private.plan_usd(p_plan public.plan, p_period public.plan_period, p_extra integer) returns numeric
language sql immutable set search_path = ''
as $$
  select case p_period when 'mensual' then 5.50 + 3.50 * p_extra else 55 + 35 * p_extra end
  where p_plan in ('Negocio', 'Sucursales')
$$;

-- Dividir entre (1 − tasa) y no multiplicar por (1 + tasa): los impuestos van sobre el total facturado, y así
-- después de pagarlos queda limpio el precio en dólares. Redondeado al boliviano.
create function private.bs_total(p_usd numeric, p_rate numeric, p_tax numeric) returns integer
language sql immutable set search_path = ''
as $$
  select round(p_usd * p_rate / (1 - p_tax))::integer
$$;

-- Cobros ---------------------------------------------------------------------------------------------------------------

create table public.plan_charges (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan public.plan not null check (plan <> 'Gratis'),
  period public.plan_period not null,
  -- Sucursales que se cobran aparte (plan Sucursales: las que pasan de la primera).
  extra_branches integer not null default 0 check (extra_branches >= 0),
  usd numeric(10, 2) not null check (usd > 0),
  rate numeric(10, 4) not null check (rate > 0),
  rate_date date not null,
  tax_rate numeric(4, 3) not null,
  amount_bs integer not null check (amount_bs > 0),
  method public.charge_method not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);
create index plan_charges_business_idx on public.plan_charges (business_id, created_at desc);
create index plan_charges_created_by_idx on public.plan_charges (created_by);

alter table public.plan_charges enable row level security;
create policy "La dueña ve los cobros de su negocio" on public.plan_charges for select to authenticated
  using ((select private.is_owner(business_id)));
create policy "Exige la verificación en dos pasos" on public.plan_charges as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Nadie escribe directo: el monto lo calcula create_plan_charge y el pago lo marca un administrador.
revoke all on public.plan_charges from anon, authenticated;
grant select on public.plan_charges to authenticated;

-- Genera el cobro, o devuelve el vigente con lo mismo (plan, período, método y sucursales): así el monto en bolivianos
-- no cambia hasta que vence.
create function private.create_plan_charge(p_business uuid, p_plan public.plan, p_period public.plan_period, p_method public.charge_method)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_extra integer := 0;
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
  if p_plan = 'Gratis' then
    raise exception 'El plan Gratis no se paga.' using errcode = 'P0001';
  end if;
  -- Bloquea el negocio: dos pedidos a la vez no crean dos cobros.
  perform 1 from public.businesses b where b.id = p_business for update;
  if p_plan = 'Sucursales' then
    select greatest(count(*) - 1, 0) into v_extra from public.branches br where br.business_id = p_business;
  end if;

  select c.id into v_id from public.plan_charges c
  where c.business_id = p_business and c.plan = p_plan and c.period = p_period and c.method = p_method
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
  v_usd := private.plan_usd(p_plan, p_period, v_extra);

  insert into public.plan_charges (business_id, plan, period, extra_branches, usd, rate, rate_date, tax_rate, amount_bs, method, expires_at)
  values (p_business, p_plan, p_period, v_extra, v_usd, v_rate.usd_bob, v_rate.rate_date, v_settings.tax_rate,
          private.bs_total(v_usd, v_rate.usd_bob, v_settings.tax_rate), p_method, now() + make_interval(days => v_settings.charge_days))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.create_plan_charge(p_business uuid, p_plan public.plan, p_period public.plan_period, p_method public.charge_method)
returns uuid
language sql security invoker set search_path = ''
as $$ select private.create_plan_charge(p_business, p_plan, p_period, p_method) $$;

-- Solo para un administrador, con SQL, al ver el pago: marca el cobro pagado, pone el plan y lo extiende un mes o un año.
-- Si ya tenía ese mismo plan vigente, suma desde el día siguiente a su vencimiento; si no, desde hoy.
-- plan_until es el último día incluido.
create function private.activate_plan_charge(p_charge uuid) returns void
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
  update public.plan_charges set paid_at = now() where id = p_charge;
end;
$$;

-- Permisos de las funciones nuevas ----------------------------------------------------------------------------------

revoke execute on function private.current_rate(), private.fetch_rate(), private.store_rate(),
  private.plan_usd(public.plan, public.plan_period, integer), private.bs_total(numeric, numeric, numeric),
  private.activate_plan_charge(uuid) from public, anon, authenticated;
revoke execute on function private.create_plan_charge(uuid, public.plan, public.plan_period, public.charge_method),
  public.create_plan_charge(uuid, public.plan, public.plan_period, public.charge_method) from public, anon;
grant execute on function private.create_plan_charge(uuid, public.plan, public.plan_period, public.charge_method),
  public.create_plan_charge(uuid, public.plan, public.plan_period, public.charge_method) to authenticated;
