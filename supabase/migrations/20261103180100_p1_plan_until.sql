-- P1: vencimiento del plan. Un plan pago vale hasta plan_until (incluido); después el negocio cuenta como Gratis
-- aunque el cron todavía no haya corrido. El cron diario avisa antes de vencer y lo pasa a Gratis al vencer.

alter table public.businesses add column plan_until date;

alter type public.notification_kind add value if not exists 'plan_expiring';
alter type public.notification_kind add value if not exists 'plan_expired';

create function private.effective_plan(p_business uuid) returns public.plan
language sql stable security definer set search_path = ''
as $$
  select case when b.plan_until is not null and b.plan_until < private.today() then 'Gratis'::public.plan else b.plan end
  from public.businesses b where b.id = p_business
$$;

create or replace function private.history_start(p_branch uuid) returns date
language sql stable security definer set search_path = ''
as $$
  select case when private.effective_plan(br.business_id) = 'Gratis' then private.today() - 60 else '-infinity'::date end
  from public.branches br
  where br.id = p_branch
$$;

create or replace function private.check_branch_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plan;
begin
  -- Bloquea el negocio: dos inserts a la vez no pasan el límite.
  perform 1 from public.businesses b where b.id = new.business_id for update;
  v_plan := private.effective_plan(new.business_id);
  if v_plan <> 'Sucursales' and exists (select 1 from public.branches br where br.business_id = new.business_id) then
    raise exception 'Tu plan % incluye 1 sucursal. Para agregar más, pasa al plan Sucursales.', v_plan using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function private.on_shift_closed_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_owner uuid;
  v_expected numeric(12, 2);
  v_difference numeric(12, 2);
begin
  select br.business_id, b.owner_id into v_business, v_owner
  from public.branches br join public.businesses b on b.id = br.business_id
  where br.id = new.branch_id;
  if private.effective_plan(v_business) = 'Gratis' or v_owner = (select auth.uid()) then
    return new;
  end if;

  v_expected := new.opening
    + coalesce((select sum(t.total) from public.sale_totals t where t.shift_id = new.shift_id and t.business_date = new.business_date), 0)
    - coalesce((select sum(g.amount) from public.expenses g where g.shift_id = new.shift_id and g.business_date = new.business_date), 0);
  v_difference := new.counted - v_expected;
  if v_difference <> 0 then
    perform private.notify(v_owner, 'cash_mismatch', v_business, null, jsonb_build_object(
      'branch', (select br.name from public.branches br where br.id = new.branch_id),
      'shift', (select s.name from public.shifts s where s.id = new.shift_id),
      'date', new.business_date,
      'difference', v_difference
    ));
  end if;
  return new;
end;
$$;

-- Corre una vez al día: avisa a 7, 3 y 1 día de vencer, y pasa a Gratis los vencidos.
create function private.plan_daily() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := private.today();
  b record;
begin
  for b in
    select id, owner_id, name, plan, plan_until from public.businesses
    where plan <> 'Gratis' and plan_until - v_today in (7, 3, 1)
  loop
    perform private.notify(b.owner_id, 'plan_expiring', b.id, null, jsonb_build_object(
      'business', b.name, 'plan', b.plan, 'until', b.plan_until, 'days', b.plan_until - v_today
    ));
  end loop;

  for b in
    select id, owner_id, name, plan from public.businesses
    where plan <> 'Gratis' and plan_until < v_today
    for update
  loop
    update public.businesses set plan = 'Gratis', plan_until = null where id = b.id;
    perform private.notify(b.owner_id, 'plan_expired', b.id, null, jsonb_build_object('business', b.name, 'plan', b.plan));
  end loop;
end;
$$;

create extension if not exists pg_cron;
-- 12:00 UTC = 08:00 en Bolivia.
select cron.schedule('plan-daily', '0 12 * * *', 'select private.plan_daily()');

-- La sesión (con el plan) va a la caché de Redis: al cambiar el plan se sube la versión del negocio
-- (v:b:<id>, src/lib/cache.ts) por el REST de Upstash. URL y token en Vault (upstash_url, upstash_token);
-- sin ellos no se hace nada y la caché vence sola a los 10 minutos.
create function private.bump_business_cache() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'upstash_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'upstash_token';
  if v_url is null or v_token is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := jsonb_build_array('INCR', 'v:b:' || new.id)
  );
  return new;
end;
$$;

create trigger businesses_bump_cache after update of plan, plan_until on public.businesses
  for each row when (old.plan is distinct from new.plan or old.plan_until is distinct from new.plan_until)
  execute function private.bump_business_cache();

revoke execute on function private.plan_daily(), private.bump_business_cache() from public, anon, authenticated;
revoke execute on function private.effective_plan(uuid) from public, anon;
grant execute on function private.effective_plan(uuid) to authenticated;
