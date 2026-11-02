-- Rubros (tienda, ropa americana, restaurante) y venta sin stock ni precio fijo. Ver docs/modelo-de-datos.md › Rubros.

-- El rubro solo cambia qué muestra la app (textos y secciones), nunca qué permite la base.
create type public.business_kind as enum ('tienda', 'ropa', 'restaurante');
alter table public.businesses add column kind public.business_kind not null default 'tienda';
grant update (name, kind) on public.businesses to authenticated;

-- null en stock: sin control de stock (platos, prendas por tipo). null en precio: se escribe al vender (prenda única).
alter table public.inventory
  alter column stock drop not null,
  alter column stock drop default,
  alter column min_stock drop not null,
  alter column min_stock drop default,
  alter column price drop not null,
  -- Sin control de stock no hay mínimo.
  add constraint inventory_min_stock_needs_stock check (stock is not null or min_stock is null);

-- Cada línea de venta toma el precio del inventario (o el que manda la venta si el precio se escribe al vender)
-- y descuenta el stock solo si se controla; si cruza el mínimo, avisa a la dueña una vez.
create or replace function private.apply_sale_item() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_branch uuid;
  v_item public.inventory;
begin
  select s.branch_id into v_branch from public.sales s where s.id = new.sale_id;
  select * into v_item from public.inventory i
  where i.branch_id = v_branch and i.product_id = new.product_id
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

  if v_item.stock is null then
    return new;
  end if;
  if v_item.stock < new.qty then
    raise exception 'No hay stock suficiente (quedan %)', v_item.stock using errcode = 'P0001';
  end if;
  update public.inventory set stock = stock - new.qty
  where branch_id = v_branch and product_id = new.product_id;

  if v_item.stock > v_item.min_stock and v_item.stock - new.qty <= v_item.min_stock then
    perform private.notify(
      (select b.owner_id from public.businesses b where b.id = v_item.business_id),
      'low_stock', v_item.business_id, null, jsonb_build_object(
        'product', (select p.name from public.products p where p.id = new.product_id),
        'branch', (select br.name from public.branches br where br.id = v_branch),
        'stock', v_item.stock - new.qty,
        'minStock', v_item.min_stock
      ));
  end if;
  return new;
end;
$$;

-- Cada ítem puede traer su precio (solo cuenta si el producto se vende con precio al escribir).
create or replace function public.register_sale(p_branch uuid, p_shift uuid, p_items jsonb) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_sale uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos' using errcode = 'P0001';
  end if;
  insert into public.sales (branch_id, shift_id) values (p_branch, p_shift) returning id into v_sale;
  insert into public.sale_items (sale_id, product_id, qty, unit_price)
  select v_sale, (x ->> 'productId')::uuid, (x ->> 'qty')::integer, coalesce((x ->> 'price')::numeric(12, 2), 0)
  from jsonb_array_elements(p_items) x;
  return v_sale;
end;
$$;

-- El negocio nace con su rubro; una tienda de ropa americana arranca con tipos de prenda para vender desde el primer minuto.
drop function public.create_business(text, text, text, text, text, jsonb);
create function public.create_business(
  p_name text, p_slug text, p_branch_name text, p_branch_slug text, p_branch_address text, p_shifts jsonb,
  p_kind public.business_kind default 'tienda'
) returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_business uuid;
  v_branch uuid;
begin
  if jsonb_typeof(p_shifts) <> 'array' or jsonb_array_length(p_shifts) = 0 then
    raise exception 'Agrega al menos un turno' using errcode = 'P0001';
  end if;
  insert into public.businesses (name, slug, kind) values (btrim(p_name), p_slug, p_kind) returning id into v_business;
  insert into public.branches (business_id, name, slug, address)
  values (v_business, btrim(p_branch_name), p_branch_slug, coalesce(btrim(p_branch_address), ''))
  returning id into v_branch;
  insert into public.shifts (branch_id, name, start_time, end_time, tone)
  select v_branch, btrim(s ->> 'name'), (s ->> 'start')::time, (s ->> 'end')::time, (s ->> 'tone')::public.shift_tone
  from jsonb_array_elements(p_shifts) s;

  if p_kind = 'ropa' then
    with types as (
      insert into public.products (business_id, name)
      select v_business, t from unnest(array['Prenda', 'Polera', 'Pantalón', 'Chamarra']) t
      returning id
    )
    insert into public.inventory (business_id, branch_id, product_id, price, stock, min_stock)
    select v_business, v_branch, id, null, null, null from types;
  end if;
  return p_slug;
end;
$$;

revoke execute on function public.create_business(text, text, text, text, text, jsonb, public.business_kind) from public, anon;
grant execute on function public.create_business(text, text, text, text, text, jsonb, public.business_kind) to authenticated;
