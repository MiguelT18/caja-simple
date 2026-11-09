-- Arreglos de 20261108190000_promotions.sql:
--   1. check_promotion_plan: el chequeo de sucursales solo en promotions (promotion_products no tiene branch_ids).
--   2. register_sale guarda la hora del mostrador (p_sold_at, acotada al turno abierto): una venta sin conexión
--      conserva su hora aunque llegue después.
--   3. La promoción usa el día real de la venta (occurred_at en hora de Bolivia), no la fecha de caja del turno.
--   4. save_promotion: guardar una promoción y sus productos en una sola transacción.

-- 1. ---------------------------------------------------------------------------------------------------------------
create or replace function private.check_promotion_plan() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.effective_plan(new.business_id) = 'Gratis' then
    raise exception 'Las promociones son de los planes pagos. Para crearlas o cambiarlas, pasa al plan Negocio.' using errcode = 'P0001';
  end if;
  -- if aparte: en promotion_products, nombrar new.branch_ids ya falla.
  if tg_table_name = 'promotions' then
    if new.branch_ids is not null and exists (
      select 1 from unnest(new.branch_ids) b(id)
      where not exists (select 1 from public.branches br where br.id = b.id and br.business_id = new.business_id)
    ) then
      raise exception 'Una de las sucursales no es de este negocio.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- 2. Igual que en 20261103190000_p0_integrity.sql, más p_sold_at --------------------------------------------------

drop function public.register_sale(uuid, uuid, uuid, public.payment_method, jsonb);
drop function private.register_sale(uuid, uuid, uuid, public.payment_method, jsonb);

create function private.register_sale(p_sale uuid, p_branch uuid, p_shift uuid, p_payment public.payment_method, p_items jsonb,
  p_sold_at timestamptz default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_opened timestamptz;
begin
  -- Security definer salta RLS, y con ella la política de la verificación en dos pasos: se exige aquí.
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if not private.can_use_branch(p_branch) then
    raise exception 'No tienes acceso a esa sucursal.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'La venta tiene demasiadas líneas (máximo 200)' using errcode = 'P0001';
  end if;

  -- La hora que manda el dispositivo, dentro del turno abierto: ni antes de abrirlo ni en el futuro.
  select c.opened_at into v_opened from public.shift_closes c
  where c.shift_id = p_shift and c.branch_id = p_branch and c.status = 'en-curso';

  -- El trigger sales_require_open_shift exige el turno abierto y pone la fecha de caja.
  insert into public.sales (id, branch_id, shift_id, payment_method, occurred_at)
  values (p_sale, p_branch, p_shift, coalesce(p_payment, 'efectivo'),
          least(now(), greatest(coalesce(p_sold_at, now()), coalesce(v_opened, now()))))
  on conflict (id) do nothing;
  if not found then
    if exists (select 1 from public.sales s where s.id = p_sale and s.branch_id = p_branch and s.recorded_by = (select auth.uid())) then
      return p_sale;
    end if;
    raise exception 'No se pudo registrar la venta. Vuelve a intentarlo.' using errcode = 'P0001';
  end if;

  insert into public.sale_items (sale_id, product_id, qty, unit_price)
  select p_sale, (x ->> 'productId')::uuid, (x ->> 'qty')::integer, coalesce((x ->> 'price')::numeric(12, 2), 0)
  from jsonb_array_elements(p_items) x
  order by (x ->> 'productId')::uuid;
  return p_sale;
end;
$$;

create function public.register_sale(p_sale uuid, p_branch uuid, p_shift uuid, p_payment public.payment_method, p_items jsonb,
  p_sold_at timestamptz default null)
returns uuid
language sql security invoker set search_path = ''
as $$ select private.register_sale(p_sale, p_branch, p_shift, p_payment, p_items, p_sold_at) $$;

revoke execute on function private.register_sale(uuid, uuid, uuid, public.payment_method, jsonb, timestamptz),
  public.register_sale(uuid, uuid, uuid, public.payment_method, jsonb, timestamptz) from public, anon;
grant execute on function private.register_sale(uuid, uuid, uuid, public.payment_method, jsonb, timestamptz),
  public.register_sale(uuid, uuid, uuid, public.payment_method, jsonb, timestamptz) to authenticated;

-- 3. Igual que en 20261108190000_promotions.sql; la promoción vale según el día real de la venta ------------------

create or replace function private.apply_sale_item() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item public.inventory;
  v_part record;
  v_parts jsonb := '[]'::jsonb;
  v_promo record;
begin
  select * into v_sale from public.sales s where s.id = new.sale_id;
  select * into v_item from public.inventory i
  where i.branch_id = v_sale.branch_id and i.product_id = new.product_id
  for update;
  if not found then
    raise exception 'Este producto no se vende en esta sucursal' using errcode = 'P0001';
  end if;

  -- El precio fijo manda: quien vende no puede cambiarlo.
  if v_item.price is not null then
    new.unit_price := v_item.price;
  elsif coalesce(new.unit_price, 0) <= 0 then
    raise exception 'Escribe el precio de «%»', (select p.name from public.products p where p.id = new.product_id) using errcode = 'P0001';
  end if;

  -- El descuento lo pone siempre la base, nunca quien vende. El día es el de la venta (un turno nocturno pasa la
  -- medianoche; una venta sin conexión trae su hora).
  select * into v_promo from private.promo_discount(v_item.business_id, v_sale.branch_id, new.product_id,
    (v_sale.occurred_at at time zone 'America/La_Paz')::date, new.qty, new.unit_price);
  new.discount := coalesce(v_promo.discount, 0);
  new.promotion_id := v_promo.promotion_id;

  -- En orden de producto, como register_sale, para bloquear el inventario siempre en el mismo orden.
  for v_part in
    select pc.component_id, pc.qty, p.name from public.product_components pc
    join public.products p on p.id = pc.component_id
    where pc.combo_id = new.product_id
    order by pc.component_id
  loop
    perform private.take_stock(v_sale.branch_id, v_part.component_id, new.qty * v_part.qty, v_part.name);
    v_parts := v_parts || jsonb_build_object('product_id', v_part.component_id, 'qty', new.qty * v_part.qty);
  end loop;
  if jsonb_array_length(v_parts) > 0 then
    new.components := v_parts;
    return new;
  end if;

  perform private.take_stock(v_sale.branch_id, new.product_id, new.qty, null);
  return new;
end;
$$;

-- 4. Guardar una promoción con sus productos, todo o nada. Security invoker: RLS y los triggers deciden igual. ------

create function public.save_promotion(
  p_business uuid, p_id uuid, p_name text, p_kind public.promo_kind,
  p_percent numeric, p_price numeric, p_buy smallint, p_pay smallint,
  p_branch_ids uuid[], p_weekdays smallint[], p_starts_on date, p_ends_on date, p_product_ids uuid[]
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null then
    insert into public.promotions (business_id, name, kind, percent, price, buy, pay, branch_ids, weekdays, starts_on, ends_on)
    values (p_business, p_name, p_kind, p_percent, p_price, p_buy, p_pay, p_branch_ids, p_weekdays, p_starts_on, p_ends_on)
    returning id into v_id;
  else
    update public.promotions
    set name = p_name, kind = p_kind, percent = p_percent, price = p_price, buy = p_buy, pay = p_pay,
        branch_ids = p_branch_ids, weekdays = p_weekdays, starts_on = p_starts_on, ends_on = p_ends_on
    where id = v_id and business_id = p_business;
    if not found then
      raise exception 'Esa promoción ya no existe.' using errcode = 'P0001';
    end if;
    delete from public.promotion_products where promotion_id = v_id;
  end if;
  insert into public.promotion_products (promotion_id, product_id, business_id)
  select distinct v_id, x, p_business from unnest(p_product_ids) x;
  return v_id;
end;
$$;

revoke execute on function public.save_promotion(uuid, uuid, text, public.promo_kind, numeric, numeric, smallint, smallint, uuid[], smallint[], date, date, uuid[])
  from public, anon;
grant execute on function public.save_promotion(uuid, uuid, text, public.promo_kind, numeric, numeric, smallint, smallint, uuid[], smallint[], date, date, uuid[])
  to authenticated;
