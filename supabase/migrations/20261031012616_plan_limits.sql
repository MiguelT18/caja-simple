-- Límites de uso según el plan del negocio. Ver docs/planes-de-suscripcion.md («Límites en la app»).
-- La base es la que manda; src/data/plans.ts (planLimits) solo los muestra y tiene que coincidir con esto.

-- El plan solo lo cambia un administrador (tras el pago): la dueña puede renombrar su negocio, nada más.
revoke update on public.businesses from authenticated;
grant update (name) on public.businesses to authenticated;

drop policy "Crear un negocio propio" on public.businesses;
create policy "Crear un negocio propio" on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()) and plan = 'Gratis');

-- Un solo negocio en Gratis por persona: para abrir otro, el que tiene tiene que estar en un plan pago.
create function private.check_free_business() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_free text;
begin
  if new.plan <> 'Gratis' then
    return new;
  end if;
  select b.name into v_free from public.businesses b
  where b.owner_id = new.owner_id and b.plan = 'Gratis' and b.id <> new.id
  limit 1;
  if v_free is not null then
    raise exception 'Ya tienes un negocio en el plan Gratis. Para abrir otro, pasa «%» a un plan pago.', v_free using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger businesses_check_free before insert on public.businesses
  for each row execute function private.check_free_business();

-- Gratis y Negocio incluyen 1 sucursal; Sucursales, las que haga falta (cada extra se cobra).
create function private.check_branch_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan public.plan;
begin
  -- Bloquea el negocio: dos inserts a la vez no pasan el límite.
  select b.plan into v_plan from public.businesses b where b.id = new.business_id for update;
  if v_plan <> 'Sucursales' and exists (select 1 from public.branches br where br.business_id = new.business_id) then
    raise exception 'Tu plan % incluye 1 sucursal. Para agregar más, pasa al plan Sucursales.', v_plan using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger branches_check_limit before insert on public.branches
  for each row execute function private.check_branch_limit();

-- Historial: en Gratis solo se ven los últimos 60 días. No se borra nada; al pasar a un plan pago reaparece.
create function private.history_start(p_branch uuid) returns date
language sql stable security definer set search_path = ''
as $$
  select case when b.plan = 'Gratis' then private.today() - 60 else '-infinity'::date end
  from public.branches br join public.businesses b on b.id = br.business_id
  where br.id = p_branch
$$;

drop policy "Ver ventas de tus sucursales" on public.sales;
create policy "Ver ventas de tus sucursales" on public.sales for select to authenticated
  using ((select private.can_use_branch(branch_id)) and business_date >= private.history_start(branch_id));

drop policy "Ver líneas de ventas de tus sucursales" on public.sale_items;
create policy "Ver líneas de ventas de tus sucursales" on public.sale_items for select to authenticated
  using (exists (
    select 1 from public.sales s
    where s.id = sale_id and (select private.can_use_branch(s.branch_id)) and s.business_date >= private.history_start(s.branch_id)
  ));

drop policy "Ver gastos de tus sucursales" on public.expenses;
create policy "Ver gastos de tus sucursales" on public.expenses for select to authenticated
  using ((select private.can_use_branch(branch_id)) and business_date >= private.history_start(branch_id));

drop policy "Ver cierres de tus sucursales" on public.shift_closes;
create policy "Ver cierres de tus sucursales" on public.shift_closes for select to authenticated
  using ((select private.can_use_branch(branch_id)) and business_date >= private.history_start(branch_id));

-- El aviso de caja descuadrada es de los planes pagos.
create or replace function private.on_shift_closed_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_owner uuid;
  v_plan public.plan;
  v_expected numeric(12, 2);
  v_difference numeric(12, 2);
begin
  select br.business_id, b.owner_id, b.plan into v_business, v_owner, v_plan
  from public.branches br join public.businesses b on b.id = br.business_id
  where br.id = new.branch_id;
  if v_plan = 'Gratis' or v_owner = (select auth.uid()) then
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

revoke execute on function private.check_free_business(), private.check_branch_limit() from public, anon, authenticated;
revoke execute on function private.history_start(uuid) from public, anon;
grant execute on function private.history_start(uuid) to authenticated;
