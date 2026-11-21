-- La dueña no opera la caja: no vende, no cobra pedidos, no registra gastos ni abre o cierra turnos, ni anula o corrige
-- lo que registró otra persona, ni reabre un turno por su cuenta (sí acepta los pedidos de reapertura). Sigue viendo todo,
-- dejando notas de cierre y adjuntando comprobantes. Para operar, se agrega a sí misma como empleada de una sucursal:
-- entra activa al instante y ahí trabaja como cualquier empleada (su turno, su horario, sus ventas).

-- Operar la caja = tener ficha activa en esa sucursal, seas o no la dueña.
create function private.works_in_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
    where e.branch_id = p_branch and e.person_id = (select auth.uid()) and e.status = 'activo'
  )
$$;
revoke execute on function private.works_in_branch(uuid) from public, anon;
grant execute on function private.works_in_branch(uuid) to authenticated;

-- Ventas y gastos (register_sale, charge_order, la cola sin conexión y el insert de gastos pasan por este trigger).
create or replace function private.require_open_shift() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_date date;
begin
  if not private.works_in_branch(new.branch_id) then
    raise exception 'Solo quien trabaja en esta sucursal registra ventas y gastos. Para hacerlo tú, agrégate como empleada en Empleados.'
      using errcode = '42501';
  end if;
  select c.business_date into v_date from public.shift_closes c
  where c.shift_id = new.shift_id and c.status = 'en-curso';
  if v_date is null then
    raise exception 'El turno no está abierto. Ábrelo en Turnos para registrar movimientos.' using errcode = 'P0001';
  end if;
  new.business_date := v_date;
  return new;
end;
$$;

-- Pedidos abiertos: los ve todo el negocio; los arma y los descarta quien trabaja ahí.
drop policy "Crear pedidos en tus sucursales" on public.orders;
drop policy "Editar pedidos abiertos" on public.orders;
drop policy "Descartar pedidos abiertos" on public.orders;
create policy "Crear pedidos en tus sucursales" on public.orders for insert to authenticated
  with check ((select private.works_in_branch(branch_id)) and sale_id is null);
create policy "Editar pedidos abiertos" on public.orders for update to authenticated
  using ((select private.works_in_branch(branch_id)) and sale_id is null)
  with check ((select private.works_in_branch(branch_id)) and sale_id is null);
create policy "Descartar pedidos abiertos" on public.orders for delete to authenticated
  using ((select private.works_in_branch(branch_id)) and sale_id is null);

-- Gastos: el insert también lo frena el trigger; la política dice lo mismo.
drop policy "Registrar gastos en tus sucursales" on public.expenses;
create policy "Registrar gastos en tus sucursales" on public.expenses for insert to authenticated
  with check ((select private.works_in_branch(branch_id)) and recorded_by = (select auth.uid()));

drop policy "Corregir gastos: la dueña, o quien lo registró con el turno abierto" on public.expenses;
create policy "Corregir gastos: quien lo registró, con el turno abierto" on public.expenses for update to authenticated
  using (voided_at is null and recorded_by = (select auth.uid()) and (select private.shift_open(shift_id, business_date)))
  with check ((select private.can_use_branch(branch_id)));

-- Turnos: los abre y los cierra quien trabaja en la sucursal.
drop policy "Abrir turno en tus sucursales" on public.shift_closes;
drop policy "Cerrar turno en tus sucursales" on public.shift_closes;
create policy "Abrir turno en tus sucursales" on public.shift_closes for insert to authenticated
  with check ((select private.works_in_branch(branch_id)) and opened_by = (select auth.uid()) and status = 'en-curso');
create policy "Cerrar turno en tus sucursales" on public.shift_closes for update to authenticated
  using ((select private.works_in_branch(branch_id)) and status = 'en-curso')
  with check ((select private.works_in_branch(branch_id)));

-- Sin excepción para la dueña: como empleada, abre solo su turno y dentro de su horario.
create or replace function private.check_shift_schedule() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_start time;
  v_end time;
  v_name text;
begin
  select s.start_time, s.end_time, s.name into v_start, v_end, v_name from public.shifts s where s.id = new.shift_id;
  if not exists (
    select 1 from public.employees e
    where e.person_id = (select auth.uid())
      and e.branch_id = new.branch_id
      and e.shift_id = new.shift_id
      and e.status = 'activo'
  ) then
    raise exception 'Solo puedes abrir tu propio turno. El turno % lo abre quien trabaja en él.', lower(v_name)
      using errcode = 'P0001';
  end if;
  if not private.in_shift_window(v_start, v_end, (now() at time zone 'America/La_Paz')::time) then
    raise exception 'El turno % se abre de % a %.',
      lower(v_name), to_char(v_start - interval '15 minutes', 'HH24:MI'), to_char(v_end, 'HH24:MI')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Anular una venta: solo quien la registró, mientras su turno sigue abierto (igual que 20261108170000_free_plan_limits.sql).
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
  if not (v_sale.recorded_by = (select auth.uid()) and private.shift_open(v_sale.shift_id, v_sale.business_date)) then
    raise exception 'Solo quien registró la venta la anula, mientras su turno está abierto.' using errcode = '42501';
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

-- Reabrir: solo aceptando un pedido (answer_reopen usa private.reopen_shift, que no está expuesto).
drop function public.reopen_shift(uuid);

-- La dueña se agrega a sí misma: entra activa, sin invitación que aceptar (igual que 20261106130000_business_directory.sql).
create or replace function private.link_invited_employee() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.email, '') = '' and new.person_id is not null then
    select u.email into new.email from auth.users u
    where u.id = new.person_id and u.email_confirmed_at is not null;
    if new.email is null then
      raise exception 'Esa cuenta ya no está disponible. Búscala de nuevo.' using errcode = 'P0001';
    end if;
  else
    -- Sin cuenta confirmada con ese correo, person_id queda en null: se vincula al confirmar.
    select u.id into new.person_id from auth.users u
    where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null;
  end if;
  new.status := case
    when exists (select 1 from public.businesses b where b.id = new.business_id and b.owner_id = new.person_id)
      then 'activo'::public.employee_status
    when exists (
      select 1 from public.join_requests r
      where r.business_id = new.business_id and r.person_id = new.person_id and r.status = 'aceptada' and r.decided_at = now()
    ) then 'activo'
    else 'invitado'
  end;
  return new;
end;
$$;
-- on_employee_invited ya no avisa cuando la ficha entra activa: cubre también a la dueña.
