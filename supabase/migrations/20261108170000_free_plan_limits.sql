-- Límites del plan Gratis para que un negocio grande con una sola sucursal pase a un plan pago, sin castigar a quien
-- vende mucho (ver docs/planes-de-suscripcion.md › «Límites en la app»):
--   · hasta 150 productos en el catálogo;
--   · sin control de stock: lo que ya estaba cargado se ve, pero queda congelado (las ventas no lo descuentan);
--   · sin combos nuevos (la importación de productos se corta en la Action importProducts);
--   · cada negocio nuevo empieza con 30 días del plan Negocio (prueba). La prueba no ocupa cupo de fundador:
--     ese cupo solo lo da un pago real (activate_plan_charge).

-- Prueba de 30 días ----------------------------------------------------------------------------------------------

alter table public.businesses add column trial boolean not null default false;
comment on column public.businesses.trial is 'El plan actual es la prueba de 30 días de Negocio (no se pagó). Lo pone el alta; lo quita un pago o el vencimiento.';

-- En un trigger y no en create_business: la política «Crear un negocio propio» exige plan = 'Gratis' al insertar.
create function private.start_trial() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.businesses set plan = 'Negocio', plan_until = private.today() + 29, trial = true where id = new.id;
  return null;
end;
$$;
create trigger businesses_start_trial after insert on public.businesses
  for each row execute function private.start_trial();

-- Igual que en 20261108140000_founder_promo.sql, y un pago termina la prueba.
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
  -- El primer pago con descuento ocupa el cupo de fundador (desde hoy cuenta su año).
  if v_charge.discount > 0 and v_business.founder_since is null then
    update public.businesses set founder_since = private.today() where id = v_charge.business_id;
  end if;
  update public.plan_charges set paid_at = now() where id = p_charge;
end;
$$;

-- Igual que en 20261103180100_p1_plan_until.sql, con `trial` en el aviso (la app dice «prueba» en vez de «plan»).
create or replace function private.plan_daily() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := private.today();
  b record;
begin
  for b in
    select id, owner_id, name, plan, plan_until, trial from public.businesses
    where plan <> 'Gratis' and plan_until - v_today in (7, 3, 1)
  loop
    perform private.notify(b.owner_id, 'plan_expiring', b.id, null, jsonb_build_object(
      'business', b.name, 'plan', b.plan, 'until', b.plan_until, 'days', b.plan_until - v_today, 'trial', b.trial
    ));
  end loop;

  for b in
    select id, owner_id, name, plan, trial from public.businesses
    where plan <> 'Gratis' and plan_until < v_today
    for update
  loop
    update public.businesses set plan = 'Gratis', plan_until = null, trial = false where id = b.id;
    perform private.notify(b.owner_id, 'plan_expired', b.id, null, jsonb_build_object('business', b.name, 'plan', b.plan, 'trial', b.trial));
  end loop;
end;
$$;

-- Hasta 150 productos en Gratis ----------------------------------------------------------------------------------

-- En un trigger por fila, las filas que la misma sentencia ya insertó se ven: importar de una vez también respeta el tope.
create function private.check_product_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Bloquea el negocio: dos inserts a la vez no pasan el límite.
  perform 1 from public.businesses b where b.id = new.business_id for update;
  if private.effective_plan(new.business_id) = 'Gratis'
     and (select count(*) from public.products p where p.business_id = new.business_id) >= 150 then
    raise exception 'El plan Gratis incluye hasta 150 productos. Para agregar más, pasa al plan Negocio.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger products_check_limit before insert on public.products
  for each row execute function private.check_product_limit();

-- Stock congelado en Gratis --------------------------------------------------------------------------------------

-- Nadie lo cambia a mano (editar, entradas, mermas, ajustes): record_stock_move también pasa por aquí.
-- take_stock y void_sale ni lo intentan en Gratis, así vender y anular siguen funcionando.
create function private.freeze_stock() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.effective_plan(new.business_id) <> 'Gratis' then
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.stock is not null or new.min_stock is not null))
     or (tg_op = 'UPDATE' and (new.stock is distinct from old.stock or new.min_stock is distinct from old.min_stock)) then
    raise exception 'El control de stock es de los planes pagos. Tu stock sigue a la vista; para cambiarlo, pasa al plan Negocio.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
-- Después de inventory_combo_without_stock (los triggers corren por orden alfabético).
create trigger inventory_freeze_stock before insert or update of stock, min_stock on public.inventory
  for each row execute function private.freeze_stock();

-- Igual que en 20261108150000_product_combos.sql; en Gratis no descuenta ni revisa si alcanza.
create or replace function private.take_stock(p_branch uuid, p_product uuid, p_qty integer, p_part text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item public.inventory;
begin
  select * into v_item from public.inventory i
  where i.branch_id = p_branch and i.product_id = p_product
  for update;
  if not found then
    raise exception 'El combo incluye «%», que no se vende en esta sucursal', p_part using errcode = 'P0001';
  end if;
  if v_item.stock is null or private.effective_plan(v_item.business_id) = 'Gratis' then
    return;
  end if;
  if v_item.stock < p_qty then
    if p_part is null then
      raise exception 'No hay stock suficiente (quedan %)', v_item.stock using errcode = 'P0001';
    end if;
    raise exception 'No hay stock de «%» para el combo (quedan %)', p_part, v_item.stock using errcode = 'P0001';
  end if;
  update public.inventory set stock = stock - p_qty
  where branch_id = p_branch and product_id = p_product;

  if v_item.stock > v_item.min_stock and v_item.stock - p_qty <= v_item.min_stock then
    perform private.notify(
      (select b.owner_id from public.businesses b where b.id = v_item.business_id),
      'low_stock', v_item.business_id, null, jsonb_build_object(
        'product', (select p.name from public.products p where p.id = p_product),
        'branch', (select br.name from public.branches br where br.id = p_branch),
        'stock', v_item.stock - p_qty,
        'minStock', v_item.min_stock
      ));
  end if;
end;
$$;
revoke all on function private.take_stock(uuid, uuid, integer, text) from public, anon, authenticated;

-- Igual que en 20261108150000_product_combos.sql; en Gratis no repone stock (está congelado).
create or replace function private.void_sale(p_sale uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_sale from public.sales s where s.id = p_sale for update;
  if v_sale.id is null or not private.can_use_branch(v_sale.branch_id) then
    raise exception 'Esa venta ya no existe.' using errcode = 'P0001';
  end if;
  if v_sale.voided_at is not null then
    raise exception 'Esa venta ya está anulada.' using errcode = 'P0001';
  end if;
  if not (private.owns_branch(v_sale.branch_id)
          or (v_sale.recorded_by = (select auth.uid()) and private.shift_open(v_sale.shift_id, v_sale.business_date))) then
    raise exception 'Solo puedes anular tus ventas mientras el turno está abierto.' using errcode = '42501';
  end if;

  update public.sales set voided_at = now(), voided_by = (select auth.uid()) where id = p_sale;
  if private.effective_plan((select br.business_id from public.branches br where br.id = v_sale.branch_id)) = 'Gratis' then
    return;
  end if;
  -- En orden de producto, igual que register_sale.
  for v_item in
    select x.product_id, sum(x.qty)::integer as qty
    from (
      select i.product_id, i.qty from public.sale_items i where i.sale_id = p_sale and i.components is null
      union all
      select (c ->> 'product_id')::uuid, (c ->> 'qty')::integer
      from public.sale_items i, jsonb_array_elements(i.components) c
      where i.sale_id = p_sale
    ) x
    group by x.product_id order by x.product_id
  loop
    update public.inventory set stock = stock + v_item.qty
    where branch_id = v_sale.branch_id and product_id = v_item.product_id and stock is not null;
  end loop;
end;
$$;

-- Combos solo en los planes pagos --------------------------------------------------------------------------------

-- Igual que en 20261108150000_product_combos.sql, con el plan primero. Los combos que ya existen se siguen vendiendo
-- y se pueden quitar (el delete no pasa por aquí).
create or replace function private.check_product_component() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.effective_plan(new.business_id) = 'Gratis' then
    raise exception 'Los combos son de los planes pagos. Para armar uno, pasa al plan Negocio.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.product_components pc where pc.combo_id = new.component_id) then
    raise exception 'Un combo no puede incluir otro combo' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.product_components pc where pc.component_id = new.combo_id) then
    raise exception 'Este producto ya está dentro de un combo: no puede ser un combo' using errcode = 'P0001';
  end if;
  update public.inventory set stock = null, min_stock = null where product_id = new.combo_id and stock is not null;
  return new;
end;
$$;

revoke execute on function private.start_trial(), private.check_product_limit(), private.freeze_stock()
  from public, anon, authenticated;
