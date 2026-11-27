-- Ver ventas, líneas, gastos, retiros y cierres sin evaluar funciones fila por fila.
--
-- Las políticas llamaban a private.can_use_branch(branch_id) y private.history_start(branch_id) con la columna de la
-- fila: aunque van entre paréntesis con select, dependen de la fila y Postgres las ejecuta una vez por fila (cada una
-- con sus propias consultas). Con una semana de ventas de 3 sucursales, leer las líneas de un período tardaba ~10 s y
-- business_stats ~28 s (statement timeout → errores 500 en toda la app).
--
-- Ahora el conjunto de sucursales de la persona se calcula una vez por consulta (subconsulta sin correlación → se
-- evalúa una sola vez y se compara con un hash). El permiso es el mismo de antes:
--   antes: can_use_branch(branch) and business_date >= history_start(branch)   (Gratis: últimos 60 días; pago: todo)
--   ahora: branch en las sucursales con plan pago de la persona (todo el historial)
--          o (business_date >= hoy - 60 y branch en sus sucursales)

-- Sucursales que la persona puede usar: las de sus negocios y aquellas donde trabaja (= private.can_use_branch).
create function private.my_branches() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select br.id from public.branches br join public.businesses b on b.id = br.business_id
  where b.owner_id = (select auth.uid())
  union
  select e.branch_id from public.employees e
  where e.person_id = (select auth.uid()) and e.status = 'activo'
$$;

-- De ellas, las de un negocio con plan pago vigente: sin límite de historial (= history_start '-infinity').
create function private.my_full_history_branches() returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select br.id from public.branches br
  where br.id in (select private.my_branches()) and private.effective_plan(br.business_id) <> 'Gratis'
$$;

revoke execute on function private.my_branches(), private.my_full_history_branches() from public, anon;
grant execute on function private.my_branches(), private.my_full_history_branches() to authenticated;

drop policy "Ver ventas de tus sucursales" on public.sales;
create policy "Ver ventas de tus sucursales" on public.sales for select to authenticated
using (
  branch_id in (select private.my_full_history_branches())
  or (business_date >= (select private.today()) - 60 and branch_id in (select private.my_branches()))
);

-- Una línea se ve si se ve su venta: la política de sales ya se aplica dentro de la subconsulta (repetir la condición
-- aquí la evaluaba dos veces por línea).
drop policy "Ver líneas de ventas de tus sucursales" on public.sale_items;
create policy "Ver líneas de ventas de tus sucursales" on public.sale_items for select to authenticated
using (exists (select 1 from public.sales s where s.id = sale_items.sale_id));

drop policy "Ver gastos de tus sucursales" on public.expenses;
create policy "Ver gastos de tus sucursales" on public.expenses for select to authenticated
using (
  branch_id in (select private.my_full_history_branches())
  or (business_date >= (select private.today()) - 60 and branch_id in (select private.my_branches()))
);

drop policy "Ver los retiros de tus sucursales" on public.cash_withdrawals;
create policy "Ver los retiros de tus sucursales" on public.cash_withdrawals for select to authenticated
using (
  branch_id in (select private.my_full_history_branches())
  or (business_date >= (select private.today()) - 60 and branch_id in (select private.my_branches()))
);

drop policy "Ver cierres de tus sucursales" on public.shift_closes;
create policy "Ver cierres de tus sucursales" on public.shift_closes for select to authenticated
using (
  branch_id in (select private.my_full_history_branches())
  or (business_date >= (select private.today()) - 60 and branch_id in (select private.my_branches()))
);

-- business_stats: igual a la versión vigente (con el descuento por línea), salvo «quiet»: la última venta de cada producto sale de
-- una consulta agrupada en vez de una subconsulta correlacionada por producto (con RLS, cada una recorría sus ventas).
CREATE OR REPLACE FUNCTION public.business_stats(p_business uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  -- La última venta de cada producto, en una sola pasada (antes, una subconsulta por producto).
  last_sales as (
    select i.product_id, max(x.business_date) as last_sale
    from public.sale_items i
    join public.sales x on x.id = i.sale_id
    join public.branches b on b.id = x.branch_id
    where b.business_id = p_business and x.voided_at is null
    group by i.product_id
  ),
  quiet as (
    select p.id, p.name, st.stock, p.created_at::date as created, ls.last_sale
    from stocked st
    join public.products p on p.id = st.product_id
    left join last_sales ls on ls.product_id = p.id
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
$function$;
