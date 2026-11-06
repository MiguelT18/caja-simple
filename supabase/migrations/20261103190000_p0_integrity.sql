-- P0: integridad del dinero. La base fija la fecha y el estado de cada apertura, registra las ventas solo por
-- public.register_sale (idempotente, con método de pago), anula ventas y gastos en vez de borrarlos y deja de
-- cortar los totales en numeric(12,2). Va después de las migraciones de P1 y recrea sus funciones de cierre.
-- Ver docs/modelo-de-datos.md.

-- Aperturas de turno ----------------------------------------------------------

alter table public.shift_closes add column opened_at timestamptz not null default now();

-- La fecha de caja de una apertura: la de hoy, o la de ayer si el turno cruza la medianoche y ya pasó de ella
-- (un turno de 22:00 a 06:00 abierto a las 00:30 es del día anterior). Hora de Bolivia.
create function private.shift_date(p_shift uuid) returns date
language sql stable security definer set search_path = ''
as $$
  select case
    when s.end_time < s.start_time and (now() at time zone 'America/La_Paz')::time < s.end_time then private.today() - 1
    else private.today()
  end
  from public.shifts s where s.id = p_shift
$$;

-- Al abrir, la base decide fecha, estado y quién abrió: el cliente solo manda turno, sucursal y monto inicial.
create function private.on_shift_open() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.status := 'en-curso';
  new.counted := null;
  new.closed_at := null;
  new.opened_at := now();
  new.opened_by := auth.uid();
  new.business_date := private.shift_date(new.shift_id);
  return new;
end;
$$;

-- Corre después de shift_closes_check_schedule (orden alfabético).
create trigger shift_closes_force_open before insert on public.shift_closes
  for each row execute function private.on_shift_open();

-- La de P1 (cierre con quién cerró y reapertura solo desde public.reopen_shift), y además congela turno,
-- sucursal y hora de apertura.
create or replace function private.on_shift_close() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'cerrado' and new.status = 'en-curso' then
    if coalesce(current_setting('caja.reopen', true), '') <> 'on' then
      raise exception 'Un turno cerrado solo lo reabre quien administra el negocio.' using errcode = '42501';
    end if;
  elsif new.status = 'cerrado' and old.status = 'en-curso' then
    new.closed_at := now();
    new.closed_by := auth.uid();
  else
    new.closed_at := old.closed_at;
    new.closed_by := old.closed_by;
  end if;
  if coalesce(current_setting('caja.reopen', true), '') <> 'on' then
    new.reopened_by := old.reopened_by;
    new.reopened_at := old.reopened_at;
  end if;
  new.shift_id := old.shift_id;
  new.branch_id := old.branch_id;
  new.opening := old.opening;
  new.opened_by := old.opened_by;
  new.opened_at := old.opened_at;
  new.business_date := old.business_date;
  return new;
end;
$$;

-- Solo estas columnas las escribe la app; lo demás lo ponen los triggers y las RPC (definer).
revoke insert, update on public.shift_closes from authenticated;
grant insert (branch_id, shift_id, opening) on public.shift_closes to authenticated;
-- note: closeShift guarda la nota al cerrar (P1); después se edita por public.set_close_note.
grant update (status, counted, note) on public.shift_closes to authenticated;

-- ¿Hay una apertura en curso de ese turno para ese día? Decide quién puede corregir un movimiento.
create function private.shift_open(p_shift uuid, p_date date) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.shift_closes c
    where c.shift_id = p_shift and c.business_date = p_date and c.status = 'en-curso'
  )
$$;

-- Ventas ------------------------------------------------------------------------

create type public.payment_method as enum ('efectivo', 'qr', 'transferencia');

alter table public.sales
  add column payment_method public.payment_method not null default 'efectivo',
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null;
create index sales_voided_by_idx on public.sales (voided_by);

-- Límites para que ningún total se desborde. not valid: rige para lo nuevo sin revisar lo que ya hay.
alter table public.sale_items
  add constraint sale_items_qty_max check (qty <= 10000) not valid,
  add constraint sale_items_unit_price_max check (unit_price <= 9999999) not valid;
alter table public.inventory add constraint inventory_price_max check (price <= 9999999) not valid;
alter table public.expenses add constraint expenses_amount_max check (amount <= 9999999) not valid;

-- Sin el ::numeric(12, 2) de antes: una venta enorme ya no rompe las páginas de la sucursal.
drop view public.sale_totals;
create view public.sale_totals with (security_invoker = true) as
select s.id as sale_id, s.branch_id, s.shift_id, s.business_date, s.occurred_at, s.recorded_by,
       sum(i.qty * i.unit_price) as total, sum(i.qty)::integer as items, s.payment_method, s.voided_at
from public.sales s
join public.sale_items i on i.sale_id = s.id
group by s.id;
revoke all on public.sale_totals from anon;
grant select on public.sale_totals to authenticated;

-- Las ventas entran solo por aquí. p_sale lo genera el cliente: si la misma venta llega dos veces (doble clic,
-- reintento sin conexión), la segunda devuelve la primera sin duplicarla. Los ítems se insertan ordenados por
-- producto para que dos ventas a la vez bloqueen el inventario en el mismo orden.
drop function public.register_sale(uuid, uuid, jsonb);

create function private.register_sale(p_sale uuid, p_branch uuid, p_shift uuid, p_payment public.payment_method, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
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

  -- El trigger sales_require_open_shift exige el turno abierto y pone la fecha de caja.
  insert into public.sales (id, branch_id, shift_id, payment_method)
  values (p_sale, p_branch, p_shift, coalesce(p_payment, 'efectivo'))
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

create function public.register_sale(p_sale uuid, p_branch uuid, p_shift uuid, p_payment public.payment_method, p_items jsonb)
returns uuid
language sql security invoker set search_path = ''
as $$ select private.register_sale(p_sale, p_branch, p_shift, p_payment, p_items) $$;

-- Anular una venta: queda registrada (no se borra) y devuelve el stock. Quien la registró puede anularla
-- mientras su turno sigue abierto; la dueña, siempre.
create function private.void_sale(p_sale uuid) returns void
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
    select i.product_id, sum(i.qty)::integer as qty from public.sale_items i
    where i.sale_id = p_sale group by i.product_id order by i.product_id
  loop
    update public.inventory set stock = stock + v_item.qty
    where branch_id = v_sale.branch_id and product_id = v_item.product_id and stock is not null;
  end loop;
end;
$$;

create function public.void_sale(p_sale uuid) returns void
language sql security invoker set search_path = ''
as $$ select private.void_sale(p_sale) $$;

-- Nadie escribe ventas ni líneas directo (antes se podían agregar líneas a una venta de un turno cerrado).
drop policy "Registrar ventas en tus sucursales" on public.sales;
drop policy "La dueña borra ventas" on public.sales;
drop policy "Agregar líneas a tus ventas" on public.sale_items;
revoke insert, update, delete on public.sales, public.sale_items from authenticated;

-- Gastos ------------------------------------------------------------------------

alter table public.expenses
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null;
create index expenses_voided_by_idx on public.expenses (voided_by);

-- El id lo manda el cliente (un reintento no duplica el gasto). Borrar es anular: no hay delete.
revoke insert, update, delete on public.expenses from authenticated;
grant insert (id, branch_id, shift_id, concept, category, amount) on public.expenses to authenticated;
grant update (concept, category, amount, voided_at) on public.expenses to authenticated;

drop policy "La dueña edita gastos" on public.expenses;
drop policy "La dueña borra gastos" on public.expenses;
create policy "Corregir gastos: la dueña, o quien lo registró con el turno abierto" on public.expenses for update to authenticated
  using (
    voided_at is null
    and ((select private.owns_branch(branch_id))
         or (recorded_by = (select auth.uid()) and (select private.shift_open(shift_id, business_date))))
  )
  with check ((select private.can_use_branch(branch_id)));

-- Al corregir: lo demás no cambia; al anular, la base pone cuándo y quién, y el gasto queda como estaba.
create function private.on_expense_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.id := old.id;
  new.branch_id := old.branch_id;
  new.shift_id := old.shift_id;
  new.recorded_by := old.recorded_by;
  new.occurred_at := old.occurred_at;
  new.business_date := old.business_date;
  if new.voided_at is not null and old.voided_at is null then
    new.voided_at := now();
    new.voided_by := auth.uid();
    new.concept := old.concept;
    new.category := old.category;
    new.amount := old.amount;
  else
    new.voided_at := old.voided_at;
    new.voided_by := old.voided_by;
  end if;
  return new;
end;
$$;

create trigger expenses_on_update before update on public.expenses
  for each row execute function private.on_expense_update();

-- Aviso de descuadre ----------------------------------------------------------------
-- La de P1 (plan efectivo), contando solo el efectivo de ventas no anuladas y los gastos no anulados.
-- Mismo cálculo que shiftCash() en src/data/cash.ts.
create or replace function private.on_shift_closed_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_owner uuid;
  v_expected numeric;
  v_difference numeric;
begin
  select br.business_id, b.owner_id into v_business, v_owner
  from public.branches br join public.businesses b on b.id = br.business_id
  where br.id = new.branch_id;
  if private.effective_plan(v_business) = 'Gratis' or v_owner = (select auth.uid()) then
    return new;
  end if;

  v_expected := new.opening
    + coalesce((select sum(t.total) from public.sale_totals t
                where t.shift_id = new.shift_id and t.business_date = new.business_date
                  and t.payment_method = 'efectivo' and t.voided_at is null), 0)
    - coalesce((select sum(g.amount) from public.expenses g
                where g.shift_id = new.shift_id and g.business_date = new.business_date and g.voided_at is null), 0);
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

-- Verificación en dos pasos en las RPC que faltaban -----------------------------------
-- Son security definer: saltan RLS y con ella la política restrictiva. Mismo cuerpo de antes más el chequeo.

create or replace function private.respond_invitation(p_employee uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_employee public.employees;
  v_owner uuid;
  v_business text;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_employee from public.employees e
  where e.id = p_employee and e.person_id = (select auth.uid()) and e.status = 'invitado'
  for update;
  if not found then
    raise exception 'Esta invitación ya no está disponible.' using errcode = 'P0001';
  end if;
  select b.owner_id, b.name into v_owner, v_business from public.businesses b where b.id = v_employee.business_id;

  if p_accept then
    update public.employees set status = 'activo' where id = p_employee;
    update public.notifications set read_at = coalesce(read_at, now()) where employee_id = p_employee;
  else
    -- Al borrar la fila se va también su aviso; la dueña puede volver a invitar.
    delete from public.employees where id = p_employee;
  end if;

  perform private.notify(v_owner, 'invitation_answer', v_employee.business_id, null, jsonb_build_object(
    'person', private.full_name(v_employee.person_id),
    'business', v_business,
    'accepted', p_accept
  ));
end;
$$;

create or replace function private.search_people(p_business uuid, p_query text, p_page integer default 1)
returns table (id uuid, email text, first_name text, last_name text, avatar_url text, by_email boolean, total bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_email text;
  v_name text;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if length(v_query) < 3 or not private.is_owner(p_business) then
    return;
  end if;
  -- Escapa los comodines de LIKE en lo que escribió la dueña.
  v_email := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_name := replace(replace(replace(private.fold(v_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    with found as (
      select p.id, p.email, p.first_name, p.last_name, p.avatar_url, lower(p.email) like v_email as by_email
      from public.profiles p
      join auth.users u on u.id = p.id and u.email_confirmed_at is not null
      where (
          lower(p.email) like v_email
          -- Cualquier palabra del nombre completo, o varias seguidas («ana pe»).
          or ' ' || private.fold(btrim(p.first_name || ' ' || p.last_name)) like '% ' || v_name
        )
        and p.id <> (select auth.uid())
        and not exists (select 1 from public.employees e where e.business_id = p_business and e.person_id = p.id)
    )
    select f.id,
           case when f.by_email then f.email else private.mask_email(f.email) end,
           f.first_name, f.last_name, f.avatar_url, f.by_email, count(*) over ()
    from found f
    order by f.by_email desc, private.fold(f.first_name), private.fold(f.last_name), f.id
    limit 5 offset (least(greatest(coalesce(p_page, 1), 1), 1000) - 1) * 5;
end;
$$;

-- Empleados: la dueña elige sucursal, turno, cargo y a quién invita; estado y cuenta los pone la base.
revoke insert, update on public.employees from authenticated;
grant insert (business_id, branch_id, shift_id, person_id, email, job_title) on public.employees to authenticated;
grant update (branch_id, shift_id, job_title) on public.employees to authenticated;

-- Permisos de las funciones nuevas ------------------------------------------------------

revoke execute on function private.on_shift_open(), private.on_expense_update() from public, anon, authenticated;
revoke execute on function private.shift_date(uuid), private.shift_open(uuid, date),
  private.register_sale(uuid, uuid, uuid, public.payment_method, jsonb), private.void_sale(uuid) from public, anon;
grant execute on function private.shift_date(uuid), private.shift_open(uuid, date),
  private.register_sale(uuid, uuid, uuid, public.payment_method, jsonb), private.void_sale(uuid) to authenticated;
revoke execute on function public.register_sale(uuid, uuid, uuid, public.payment_method, jsonb), public.void_sale(uuid) from public, anon;
grant execute on function public.register_sale(uuid, uuid, uuid, public.payment_method, jsonb), public.void_sale(uuid) to authenticated;
