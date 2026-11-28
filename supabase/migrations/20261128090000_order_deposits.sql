-- Encargos con adelanto: un pedido abierto (public.orders) puede ser un encargo de un cliente, con teléfono, para qué
-- día y cómo se entrega (envío, encomienda). El adelanto entra a la caja del turno en que se recibe; al cobrar el
-- pedido la venta queda por el total y el adelanto se descuenta de lo que entra ese día, así cada caja cuadra.
--
-- public.order_deposits guarda los movimientos con signo: «adelanto» (+, entra a la caja), «aplicado» (−, al cobrar:
-- en el turno y con el medio de pago de la venta) y «devuelto» (−, sale de la caja al devolverlo). Un pedido con
-- adelanto sin devolver no se descarta. Solo el efectivo cuenta en el arqueo, como en las ventas.

alter table public.orders
  add column phone text check (char_length(phone) <= 30),
  add column due_on date,
  add column delivery text check (char_length(delivery) <= 120);
grant insert (phone, due_on, delivery), update (phone, due_on, delivery) on public.orders to authenticated;

create table public.order_deposits (
  id uuid primary key,
  order_id uuid references public.orders (id) on delete set null,
  branch_id uuid not null references public.branches (id) on delete cascade,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  business_date date not null,
  kind text not null check (kind in ('adelanto', 'aplicado', 'devuelto')),
  amount numeric(12, 2) not null check (amount <> 0 and (kind = 'adelanto') = (amount > 0)),
  payment_method public.payment_method not null,
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index order_deposits_order_idx on public.order_deposits (order_id);
create index order_deposits_shift_idx on public.order_deposits (shift_id, business_date);
create index order_deposits_branch_idx on public.order_deposits (branch_id, business_date);
create index order_deposits_recorded_by_idx on public.order_deposits (recorded_by);

alter table public.order_deposits enable row level security;
create policy "Ver adelantos de tus sucursales" on public.order_deposits for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.order_deposits as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Se escribe solo con add_order_deposit, refund_order_deposit y charge_order.
revoke all on public.order_deposits from anon, authenticated;
grant select on public.order_deposits to authenticated;

-- La caja en vivo se entera, como con ventas y gastos.
create trigger order_deposits_broadcast after insert on public.order_deposits
  for each row execute function private.broadcast_till();

-- Lo que queda de adelanto en un pedido (adelantos menos lo aplicado y lo devuelto).
create function private.order_deposit_balance(p_order uuid) returns numeric
language sql stable security definer set search_path = ''
as $$ select coalesce(sum(d.amount), 0) from public.order_deposits d where d.order_id = p_order $$;
revoke execute on function private.order_deposit_balance(uuid) from public, anon, authenticated;

-- El turno abierto de quien registra, en esa sucursal (como ventas y gastos: hay que trabajar ahí y tenerlo abierto).
create function private.my_open_close(p_branch uuid, p_shift uuid) returns date
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_date date;
begin
  if not private.works_in_branch(p_branch) then
    raise exception 'Solo quien trabaja en esta sucursal recibe y devuelve adelantos.' using errcode = '42501';
  end if;
  select c.business_date into v_date from public.shift_closes c
  where c.shift_id = p_shift and c.branch_id = p_branch and c.status = 'en-curso';
  if v_date is null then
    raise exception 'El turno no está abierto. Ábrelo en Turnos para recibir el adelanto.' using errcode = 'P0001';
  end if;
  return v_date;
end;
$$;
revoke execute on function private.my_open_close(uuid, uuid) from public, anon, authenticated;

-- Recibir un adelanto (o otro más) de un pedido abierto. El id lo manda el navegador: dos envíos, un solo adelanto.
create function private.add_order_deposit(p_id uuid, p_order uuid, p_shift uuid, p_amount numeric, p_payment public.payment_method)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_date date;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_deposits d where d.id = p_id) then
    return;
  end if;
  select * into v_order from public.orders o where o.id = p_order for update;
  if not found or not private.can_use_branch(v_order.branch_id) then
    raise exception 'Ese pedido ya no existe.' using errcode = 'P0001';
  end if;
  if v_order.sale_id is not null then
    raise exception 'Ese pedido ya se cobró.' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El adelanto tiene que ser mayor a cero.' using errcode = 'P0001';
  end if;
  v_date := private.my_open_close(v_order.branch_id, p_shift);
  insert into public.order_deposits (id, order_id, branch_id, shift_id, business_date, kind, amount, payment_method)
  values (p_id, p_order, v_order.branch_id, p_shift, v_date, 'adelanto', round(p_amount, 2), p_payment);
end;
$$;

-- Devolver todo el adelanto (sale de la caja del turno abierto, en efectivo). Después el pedido se puede descartar.
create function private.refund_order_deposit(p_id uuid, p_order uuid, p_shift uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_balance numeric;
  v_date date;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_deposits d where d.id = p_id) then
    return;
  end if;
  select * into v_order from public.orders o where o.id = p_order for update;
  if not found or not private.can_use_branch(v_order.branch_id) then
    raise exception 'Ese pedido ya no existe.' using errcode = 'P0001';
  end if;
  v_balance := private.order_deposit_balance(p_order);
  if v_order.sale_id is not null or v_balance <= 0 then
    raise exception 'Ese pedido no tiene adelanto por devolver.' using errcode = 'P0001';
  end if;
  v_date := private.my_open_close(v_order.branch_id, p_shift);
  insert into public.order_deposits (id, order_id, branch_id, shift_id, business_date, kind, amount, payment_method)
  values (p_id, p_order, v_order.branch_id, p_shift, v_date, 'devuelto', -v_balance, 'efectivo');
end;
$$;

create function public.add_order_deposit(p_id uuid, p_order uuid, p_shift uuid, p_amount numeric, p_payment public.payment_method)
returns void language sql security invoker set search_path = ''
as $$ select private.add_order_deposit(p_id, p_order, p_shift, p_amount, p_payment) $$;
create function public.refund_order_deposit(p_id uuid, p_order uuid, p_shift uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.refund_order_deposit(p_id, p_order, p_shift) $$;

revoke execute on function private.add_order_deposit(uuid, uuid, uuid, numeric, public.payment_method), public.add_order_deposit(uuid, uuid, uuid, numeric, public.payment_method),
  private.refund_order_deposit(uuid, uuid, uuid), public.refund_order_deposit(uuid, uuid, uuid) from public, anon;
grant execute on function private.add_order_deposit(uuid, uuid, uuid, numeric, public.payment_method), public.add_order_deposit(uuid, uuid, uuid, numeric, public.payment_method),
  private.refund_order_deposit(uuid, uuid, uuid), public.refund_order_deposit(uuid, uuid, uuid) to authenticated;

-- Un pedido con adelanto sin devolver no se descarta: el dinero quedaría sin explicar en la caja.
create function private.keep_order_with_deposit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.sale_id is null and private.order_deposit_balance(old.id) > 0 then
    raise exception 'Este pedido tiene un adelanto. Devuélvelo en Pedidos antes de descartarlo.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke execute on function private.keep_order_with_deposit() from public, anon, authenticated;
create trigger orders_keep_deposit before delete on public.orders
  for each row execute function private.keep_order_with_deposit();

-- Cobrar un pedido: la venta queda por el total y lo que quede de adelanto se aplica en el mismo turno, con el medio
-- de pago de la venta (en efectivo, al cajón entra solo el saldo).
create or replace function private.charge_order(p_order uuid, p_sale uuid, p_shift uuid, p_payment public.payment_method, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_balance numeric;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found or not private.can_use_branch(v_order.branch_id) then
    raise exception 'Ese pedido ya no existe.' using errcode = 'P0001';
  end if;
  if v_order.sale_id = p_sale then
    return p_sale;
  end if;
  if v_order.sale_id is not null then
    raise exception 'Ese pedido ya se cobró.' using errcode = 'P0001';
  end if;

  perform private.register_sale(p_sale, v_order.branch_id, p_shift, p_payment, p_items);
  update public.orders set sale_id = p_sale, items = p_items where id = p_order;
  v_balance := private.order_deposit_balance(p_order);
  if v_balance > 0 then
    insert into public.order_deposits (id, order_id, branch_id, shift_id, business_date, kind, amount, payment_method)
    select gen_random_uuid(), p_order, v_order.branch_id, p_shift, c.business_date, 'aplicado', -v_balance, p_payment
    from public.shift_closes c where c.shift_id = p_shift and c.status = 'en-curso';
  end if;
  return p_sale;
end;
$$;

-- El aviso de cierre cuenta los adelantos en efectivo. Mismo cálculo que shiftCash() en src/data/cash.ts.
create or replace function private.on_shift_closed_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_owner uuid;
  v_expected numeric;
begin
  select br.business_id, b.owner_id into v_business, v_owner
  from public.branches br join public.businesses b on b.id = br.business_id
  where br.id = new.branch_id;
  -- Si la cierra ella misma, ya lo vio en pantalla.
  if v_owner = (select auth.uid()) then
    return new;
  end if;

  v_expected := new.opening
    + coalesce((select sum(t.total) from public.sale_totals t
                where t.shift_id = new.shift_id and t.business_date = new.business_date
                  and t.payment_method = 'efectivo' and t.voided_at is null), 0)
    + coalesce((select sum(d.amount) from public.order_deposits d
                where d.shift_id = new.shift_id and d.business_date = new.business_date and d.payment_method = 'efectivo'), 0)
    - coalesce((select sum(g.amount) from public.expenses g
                where g.shift_id = new.shift_id and g.business_date = new.business_date and g.voided_at is null), 0)
    - coalesce((select sum(w.amount) from public.cash_withdrawals w
                where w.shift_id = new.shift_id and w.business_date = new.business_date and w.voided_at is null), 0);
  perform private.notify(v_owner, 'shift_closed', v_business, null, jsonb_build_object(
    'branch', (select br.name from public.branches br where br.id = new.branch_id),
    'shift', (select s.name from public.shifts s where s.id = new.shift_id),
    'person', (select p.first_name from public.profiles p where p.id = (select auth.uid())),
    'date', new.business_date,
    'difference', new.counted - v_expected
  ));
  return new;
end;
$$;
