-- Combos: un producto del catálogo que incluye otros (con su cantidad). Se vende como cualquier producto,
-- con su precio en el inventario de cada sucursal, y al venderse descuenta el stock de lo que incluye.

create table public.product_components (
  combo_id uuid not null,
  component_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  qty integer not null check (qty between 1 and 99),
  primary key (combo_id, component_id),
  foreign key (combo_id, business_id) references public.products (id, business_id) on delete cascade,
  -- Un producto que está en un combo no se borra (se quita primero del combo).
  foreign key (component_id, business_id) references public.products (id, business_id),
  check (combo_id <> component_id)
);
create index product_components_component_idx on public.product_components (component_id);
create index product_components_business_idx on public.product_components (business_id);

alter table public.product_components enable row level security;
create policy "Ver los combos del negocio" on public.product_components for select to authenticated
  using ((select private.is_member(business_id)));
create policy "La dueña arma combos" on public.product_components for insert to authenticated
  with check ((select private.is_owner(business_id)));
create policy "La dueña edita combos" on public.product_components for update to authenticated
  using ((select private.is_owner(business_id))) with check ((select private.is_owner(business_id)));
create policy "La dueña borra combos" on public.product_components for delete to authenticated
  using ((select private.is_owner(business_id)));
create policy "Exige la verificación en dos pasos" on public.product_components as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.product_components from anon;

-- Sin combos dentro de combos. Al volverse combo, el producto deja de llevar stock propio.
create function private.check_product_component() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
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
create trigger product_components_check before insert or update on public.product_components
  for each row execute function private.check_product_component();

-- El stock de un combo sale de sus productos: su fila de inventario nunca lleva stock propio.
create function private.combo_without_stock() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.stock is not null and exists (select 1 from public.product_components pc where pc.combo_id = new.product_id) then
    new.stock := null;
    new.min_stock := null;
  end if;
  return new;
end;
$$;
create trigger inventory_combo_without_stock before insert or update of stock, min_stock on public.inventory
  for each row execute function private.combo_without_stock();

-- Lo que una línea de combo descontó ([{product_id, qty}]): anular devuelve eso aunque después se edite el combo.
alter table public.sale_items add column components jsonb;

-- Descuenta stock de un producto en una sucursal (si lo controla) y avisa si cruza el mínimo.
-- p_part: nombre del producto cuando es parte de un combo (para el mensaje).
create function private.take_stock(p_branch uuid, p_product uuid, p_qty integer, p_part text) returns void
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
  if v_item.stock is null then
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

-- Cada línea de venta toma el precio del inventario (o el que manda la venta si el precio se escribe al vender)
-- y descuenta el stock; un combo lo descuenta de cada producto que incluye.
create or replace function private.apply_sale_item() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_branch uuid;
  v_item public.inventory;
  v_part record;
  v_parts jsonb := '[]'::jsonb;
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

  -- En orden de producto, como register_sale, para bloquear el inventario siempre en el mismo orden.
  for v_part in
    select pc.component_id, pc.qty, p.name from public.product_components pc
    join public.products p on p.id = pc.component_id
    where pc.combo_id = new.product_id
    order by pc.component_id
  loop
    perform private.take_stock(v_branch, v_part.component_id, new.qty * v_part.qty, v_part.name);
    v_parts := v_parts || jsonb_build_object('product_id', v_part.component_id, 'qty', new.qty * v_part.qty);
  end loop;
  if jsonb_array_length(v_parts) > 0 then
    new.components := v_parts;
    return new;
  end if;

  perform private.take_stock(v_branch, new.product_id, new.qty, null);
  return new;
end;
$$;

-- Anular: igual que antes, y las líneas de combo devuelven lo que descontaron de cada producto.
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

-- Estadísticas: los pares de productos llevan sus ids, para armar el combo desde la idea del Resumen.
create or replace function public.business_stats(p_business uuid, p_from date, p_to date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with s as (
    select s.id, s.branch_id, s.business_date, s.occurred_at
    from public.sales s
    join public.branches b on b.id = s.branch_id
    where b.business_id = p_business and s.voided_at is null and s.business_date between p_from and p_to
  ),
  lines as (
    select i.sale_id, i.product_id, i.qty, i.qty * i.unit_price as amount
    from public.sale_items i
    join s on s.id = i.sale_id
  ),
  totals as (
    select s.id, s.branch_id, s.business_date, s.occurred_at, sum(l.amount) as total
    from s
    join lines l on l.sale_id = s.id
    group by s.id, s.branch_id, s.business_date, s.occurred_at
  ),
  pairs as (
    select a.product_id as a, b.product_id as b, count(*) as times
    from lines a
    join lines b on b.sale_id = a.sale_id and a.product_id < b.product_id
    group by 1, 2
    order by times desc
    limit 5
  ),
  stocked as (
    select inv.product_id, sum(inv.stock) as stock
    from public.inventory inv
    where inv.business_id = p_business and inv.stock > 0
    group by inv.product_id
  ),
  quiet as (
    select p.id, p.name, st.stock, p.created_at::date as created,
      (select max(x.business_date)
         from public.sale_items i
         join public.sales x on x.id = i.sale_id
        where i.product_id = p.id and x.voided_at is null) as last_sale
    from stocked st
    join public.products p on p.id = st.product_id
  )
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(t order by t.revenue desc, t.qty desc)
      from (
        select p.id, p.name, sum(l.qty)::int as qty, sum(l.amount) as revenue
        from lines l
        join public.products p on p.id = l.product_id
        group by p.id, p.name
        order by revenue desc, qty desc
        limit 10
      ) t), '[]'::jsonb),
    'branches', coalesce((
      select jsonb_agg(t)
      from (select branch_id as id, sum(total) as revenue, count(*)::int as sales from totals group by branch_id) t
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(t order by t.hour)
      from (
        select extract(hour from occurred_at at time zone 'America/La_Paz')::int as hour, sum(total) as revenue
        from totals group by 1
      ) t), '[]'::jsonb),
    'weekdays', coalesce((
      select jsonb_agg(t order by t.dow)
      from (
        select extract(isodow from business_date)::int as dow, sum(total) as revenue, count(distinct business_date)::int as days
        from totals group by 1
      ) t), '[]'::jsonb),
    'pairs', coalesce((
      select jsonb_agg(jsonb_build_object('a', pa.name, 'b', pb.name, 'aId', pa.id, 'bId', pb.id, 'times', pr.times) order by pr.times desc)
      from pairs pr
      join public.products pa on pa.id = pr.a
      join public.products pb on pb.id = pr.b
    ), '[]'::jsonb),
    -- Con stock y sin ventas en 30 días (o nunca, si existe hace más de 30 días): candidatos a promoción.
    'quiet', coalesce((
      select jsonb_agg(t order by t.last_sale nulls first, t.stock desc)
      from (
        select id, name, stock, last_sale
        from quiet
        where coalesce(last_sale, created) < p_to - 30
        order by last_sale nulls first, stock desc
        limit 5
      ) t), '[]'::jsonb)
  )
$$;
