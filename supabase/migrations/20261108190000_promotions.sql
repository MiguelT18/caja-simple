-- Promociones: descuentos de la dueña sobre ciertos productos, en todas o algunas sucursales, con fechas opcionales
-- (sin fecha límite si no tiene «hasta») y días de la semana opcionales («todos los viernes»). Tres tipos:
--   · percent: un % menos;  · price: precio especial por unidad;  · bundle: lleva `buy`, paga `pay` (3x2).
-- El descuento lo calcula la base al vender y queda en la línea (sale_items.discount): unit_price sigue siendo el
-- precio de lista y el total de la línea es qty * unit_price - discount. Si varias valen, gana la que más descuenta.
-- Solo en los planes pagos. src/lib/promos.ts repite la cuenta para mostrarla al vender.

create type public.promo_kind as enum ('percent', 'price', 'bundle');

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  kind public.promo_kind not null,
  percent numeric(5, 2) check (percent between 1 and 99),
  price numeric(12, 2) check (price between 0 and 9999999),
  buy smallint check (buy between 2 and 20),
  pay smallint check (pay >= 1 and pay < buy),
  branch_ids uuid[] check (cardinality(branch_ids) > 0),
  weekdays smallint[] check (cardinality(weekdays) > 0 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  starts_on date,
  ends_on date check (ends_on >= starts_on),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  check (case kind
    when 'percent' then percent is not null and price is null and buy is null and pay is null
    when 'price' then price is not null and percent is null and buy is null and pay is null
    else buy is not null and pay is not null and percent is null and price is null
  end)
);
comment on column public.promotions.branch_ids is 'Sucursales donde vale; null = todas (también las que se creen después).';
comment on column public.promotions.weekdays is 'Días ISO (1 = lunes … 7 = domingo); null = todos los días.';
create index promotions_business_idx on public.promotions (business_id);

create table public.promotion_products (
  promotion_id uuid not null,
  product_id uuid not null,
  business_id uuid not null references public.businesses (id) on delete cascade,
  primary key (promotion_id, product_id),
  foreign key (promotion_id, business_id) references public.promotions (id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);
create index promotion_products_product_idx on public.promotion_products (product_id);
create index promotion_products_business_idx on public.promotion_products (business_id);

alter table public.promotions enable row level security;
create policy "Ver las promociones del negocio" on public.promotions for select to authenticated
  using ((select private.is_member(business_id)));
create policy "La dueña crea promociones" on public.promotions for insert to authenticated
  with check ((select private.is_owner(business_id)));
create policy "La dueña edita promociones" on public.promotions for update to authenticated
  using ((select private.is_owner(business_id))) with check ((select private.is_owner(business_id)));
create policy "La dueña borra promociones" on public.promotions for delete to authenticated
  using ((select private.is_owner(business_id)));
create policy "Exige la verificación en dos pasos" on public.promotions as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.promotions from anon;

alter table public.promotion_products enable row level security;
create policy "Ver los productos de las promociones" on public.promotion_products for select to authenticated
  using ((select private.is_member(business_id)));
create policy "La dueña agrega productos a promociones" on public.promotion_products for insert to authenticated
  with check ((select private.is_owner(business_id)));
create policy "La dueña quita productos de promociones" on public.promotion_products for delete to authenticated
  using ((select private.is_owner(business_id)));
create policy "Exige la verificación en dos pasos" on public.promotion_products as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.promotion_products from anon;

-- Solo planes pagos. Borrar sí se puede siempre (no pasa por aquí).
create function private.check_promotion_plan() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.effective_plan(new.business_id) = 'Gratis' then
    raise exception 'Las promociones son de los planes pagos. Para crearlas o cambiarlas, pasa al plan Negocio.' using errcode = 'P0001';
  end if;
  if new.branch_ids is not null and exists (
    select 1 from unnest(new.branch_ids) b(id)
    where not exists (select 1 from public.branches br where br.id = b.id and br.business_id = new.business_id)
  ) then
    raise exception 'Una de las sucursales no es de este negocio.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger promotions_check_plan before insert or update on public.promotions
  for each row execute function private.check_promotion_plan();
create trigger promotion_products_check_plan before insert on public.promotion_products
  for each row execute function private.check_promotion_plan();

-- El mayor descuento que vale para una línea (0 y null si ninguna). La misma cuenta que lineDiscount en src/lib/promos.ts.
create function private.promo_discount(p_business uuid, p_branch uuid, p_product uuid, p_date date, p_qty integer, p_price numeric)
returns table (discount numeric(12, 2), promotion_id uuid)
language sql stable security definer set search_path = ''
as $$
  select least(d.amount, p_qty * p_price)::numeric(12, 2), d.id
  from (
    select pr.id, case pr.kind
      when 'percent' then round(p_qty * p_price * pr.percent / 100, 2)
      when 'price' then greatest(0, p_price - pr.price) * p_qty
      else floor(p_qty / pr.buy) * (pr.buy - pr.pay) * p_price
    end as amount
    from public.promotions pr
    join public.promotion_products pp on pp.promotion_id = pr.id and pp.product_id = p_product
    where pr.business_id = p_business
      and pr.active
      and (pr.branch_ids is null or p_branch = any (pr.branch_ids))
      and (pr.starts_on is null or p_date >= pr.starts_on)
      and (pr.ends_on is null or p_date <= pr.ends_on)
      and (pr.weekdays is null or extract(isodow from p_date)::smallint = any (pr.weekdays))
      and private.effective_plan(p_business) <> 'Gratis'
  ) d
  where d.amount > 0
  order by d.amount desc, d.id
  limit 1
$$;

alter table public.sale_items
  add column discount numeric(12, 2) not null default 0 check (discount >= 0),
  add column promotion_id uuid references public.promotions (id) on delete set null;
create index sale_items_promotion_idx on public.sale_items (promotion_id) where promotion_id is not null;

-- Igual que en 20261108150000_product_combos.sql, más el descuento de la promoción (con la fecha de caja de la venta).
-- shortcut: una venta sin conexión que se sincroniza otro día dentro del mismo turno usa la fecha de caja del turno.
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

  -- El descuento lo pone siempre la base, nunca quien vende.
  select * into v_promo from private.promo_discount(v_item.business_id, v_sale.branch_id, new.product_id, v_sale.business_date, new.qty, new.unit_price);
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

-- Igual que en 20261104130000_sale_receipts.sql, con el descuento restado.
create or replace view public.sale_totals with (security_invoker = true) as
select s.id as sale_id, s.branch_id, s.shift_id, s.business_date, s.occurred_at, s.recorded_by,
       sum(i.qty * i.unit_price - i.discount) as total, sum(i.qty)::integer as items, s.payment_method, s.voided_at,
       s.receipt_path
from public.sales s
join public.sale_items i on i.sale_id = s.id
group by s.id;

revoke execute on function private.check_promotion_plan(), private.promo_discount(uuid, uuid, uuid, date, integer, numeric)
  from public, anon, authenticated;

-- Igual que en 20261108150000_product_combos.sql, con el descuento restado de cada línea.
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
    select i.sale_id, i.product_id, i.qty, i.qty * i.unit_price - i.discount as amount
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
