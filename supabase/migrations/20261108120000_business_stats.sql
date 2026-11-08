-- Estadísticas del Resumen del negocio: más vendidos, sucursales, ritmo (hora y día), pares de productos y
-- productos quietos. Se agrega aquí para no bajar el historial entero a la página.
-- security invoker: RLS decide qué ventas ve quien llama (en la práctica, la dueña). Excluye las anuladas.
create function public.business_stats(p_business uuid, p_from date, p_to date)
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
      select jsonb_agg(jsonb_build_object('a', pa.name, 'b', pb.name, 'times', pr.times) order by pr.times desc)
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

revoke all on function public.business_stats(uuid, date, date) from public, anon;
grant execute on function public.business_stats(uuid, date, date) to authenticated;
