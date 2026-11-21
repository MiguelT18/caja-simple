-- Gastos fijos y pagos pendientes. La dueña anota los gastos que se repiten (alquiler, sueldos, luz…) y cada
-- período se vuelve un pendiente; también se anotan pendientes sueltos (lo que no alcanzó a pagarse el día).
-- Un pendiente se paga en una o varias veces, de la caja (es un gasto del turno abierto: resta del cuadre de
-- hoy) o fuera de la caja (no toca ningún turno). El gasto de la caja guarda en owed_on el día que
-- correspondía; su business_date sigue siendo el del turno, porque el cuadre empareja por turno y día.

create type public.expense_frequency as enum ('semanal', 'quincenal', 'mensual');

-- Gastos fijos (la plantilla) ---------------------------------------------------------

create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  concept text not null check (length(btrim(concept)) between 1 and 120),
  category text not null check (length(btrim(category)) between 1 and 40),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 9999999),
  frequency public.expense_frequency not null,
  -- El primer día que toca pagar; los demás salen de sumarle 7 o 14 días, o meses.
  starts_on date not null,
  -- Días después de esa fecha en que vence; null = sin vencimiento.
  grace_days integer check (grace_days between 0 and 365),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index fixed_expenses_branch_idx on public.fixed_expenses (branch_id);

alter table public.fixed_expenses enable row level security;
create policy "La dueña ve y anota los gastos fijos" on public.fixed_expenses for all to authenticated
  using ((select private.owns_branch(branch_id))) with check ((select private.owns_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.fixed_expenses as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.fixed_expenses from anon, authenticated;
grant select on public.fixed_expenses to authenticated;
grant insert (id, branch_id, concept, category, amount, frequency, starts_on, grace_days) on public.fixed_expenses to authenticated;
grant update (concept, category, amount, frequency, starts_on, grace_days, archived_at) on public.fixed_expenses to authenticated;

-- Pendientes ----------------------------------------------------------------------

create table public.pending_expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  fixed_expense_id uuid references public.fixed_expenses (id) on delete set null,
  -- El día que correspondía pagar: con esa fecha queda el gasto al pagarlo.
  owed_on date not null default private.today(),
  due_on date,
  concept text not null check (length(btrim(concept)) between 1 and 120),
  category text not null check (length(btrim(category)) between 1 and 40),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 9999999),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  canceled_by uuid references public.profiles (id) on delete set null,
  check (due_on is null or due_on >= owed_on),
  -- Cada período de un gasto fijo se genera una sola vez (aunque se cancele).
  unique (fixed_expense_id, owed_on)
);
create index pending_expenses_open_idx on public.pending_expenses (branch_id, owed_on) where canceled_at is null;
create index pending_expenses_created_by_idx on public.pending_expenses (created_by);
create index pending_expenses_canceled_by_idx on public.pending_expenses (canceled_by);

alter table public.pending_expenses enable row level security;
create policy "Ver los pendientes de tus sucursales" on public.pending_expenses for select to authenticated
  using ((select private.can_use_branch(branch_id)));
-- Anotar una deuda no es operar la caja: la dueña también puede.
create policy "Anotar pendientes en tus sucursales" on public.pending_expenses for insert to authenticated
  with check (
    ((select private.owns_branch(branch_id)) or (select private.works_in_branch(branch_id)))
    and created_by = (select auth.uid())
    and fixed_expense_id is null
  );
create policy "Corregir o cancelar: la dueña, o quien lo anotó" on public.pending_expenses for update to authenticated
  using (canceled_at is null and ((select private.owns_branch(branch_id)) or created_by = (select auth.uid())))
  with check ((select private.can_use_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.pending_expenses as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.pending_expenses from anon, authenticated;
grant select on public.pending_expenses to authenticated;
grant insert (id, branch_id, due_on, concept, category, amount) on public.pending_expenses to authenticated;
grant update (amount, due_on, canceled_at) on public.pending_expenses to authenticated;

-- Pagos ---------------------------------------------------------------------------

create table public.pending_payments (
  -- Lo manda el navegador: el mismo pago enviado dos veces no se repite.
  id uuid primary key,
  pending_id uuid not null references public.pending_expenses (id) on delete cascade,
  -- Copia de la sucursal del pendiente, para los permisos y el aviso en vivo.
  branch_id uuid not null references public.branches (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  -- Lleno: salió de la caja (el gasto del turno). Null: se pagó fuera de la caja.
  expense_id uuid unique references public.expenses (id) on delete cascade,
  paid_at timestamptz not null default now(),
  paid_by uuid default auth.uid() references public.profiles (id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null
);
create index pending_payments_pending_idx on public.pending_payments (pending_id);
create index pending_payments_branch_idx on public.pending_payments (branch_id, paid_at);
create index pending_payments_paid_by_idx on public.pending_payments (paid_by);
create index pending_payments_voided_by_idx on public.pending_payments (voided_by);

alter table public.pending_payments enable row level security;
create policy "Ver los pagos de tus sucursales" on public.pending_payments for select to authenticated
  using ((select private.can_use_branch(branch_id)));
-- Un pago de la caja se deshace anulando su gasto; uno de fuera, anulándolo aquí.
create policy "Anular un pago fuera de la caja: la dueña, o quien lo hizo" on public.pending_payments for update to authenticated
  using (voided_at is null and expense_id is null and ((select private.owns_branch(branch_id)) or paid_by = (select auth.uid())))
  with check ((select private.can_use_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.pending_payments as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.pending_payments from anon, authenticated;
grant select on public.pending_payments to authenticated;
grant update (voided_at) on public.pending_payments to authenticated;

-- El día que correspondía, en el gasto de la caja que salda un pendiente. Solo lo escribe pay_pending_expense.
alter table public.expenses add column owed_on date;

-- Lo pagado de cada pendiente. Un pago de la caja cuenta mientras su gasto no esté anulado.
create view public.pending_balances with (security_invoker = true) as
select p.*, coalesce(pay.paid, 0)::numeric(12, 2) as paid, (p.amount - coalesce(pay.paid, 0))::numeric(12, 2) as balance
from public.pending_expenses p
left join lateral (
  select sum(x.amount) as paid
  from public.pending_payments x
  left join public.expenses e on e.id = x.expense_id
  where x.pending_id = p.id and x.voided_at is null and (x.expense_id is null or e.voided_at is null)
) pay on true;
revoke all on public.pending_balances from anon;
grant select on public.pending_balances to authenticated;

create function private.pending_paid(p_pending uuid) returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(x.amount), 0)
  from public.pending_payments x
  left join public.expenses e on e.id = x.expense_id
  where x.pending_id = p_pending and x.voided_at is null and (x.expense_id is null or e.voided_at is null)
$$;
revoke execute on function private.pending_paid(uuid) from public, anon, authenticated;

-- Quién cancela o anula lo pone la base; corregir monto y vencimiento es solo de la dueña,
-- y el monto nunca queda por debajo de lo ya pagado.
create function private.on_pending_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.amount, new.due_on) is distinct from (old.amount, old.due_on) and not private.owns_branch(old.branch_id) then
    raise exception 'Solo la dueña corrige el monto o el vencimiento.' using errcode = '42501';
  end if;
  if new.due_on is not null and new.due_on < old.owed_on then
    raise exception 'El vencimiento no puede ser antes del día que tocaba pagar.' using errcode = 'P0001';
  end if;
  if new.amount < private.pending_paid(old.id) then
    raise exception 'El monto no puede ser menor que lo que ya se pagó.' using errcode = 'P0001';
  end if;
  if new.canceled_at is not null then
    new.canceled_at := now();
    new.canceled_by := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function private.on_pending_update() from public, anon, authenticated;
create trigger pending_expenses_on_update before update on public.pending_expenses
  for each row execute function private.on_pending_update();

create function private.on_payment_void() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.voided_at := now();
  new.voided_by := (select auth.uid());
  return new;
end;
$$;
revoke execute on function private.on_payment_void() from public, anon, authenticated;
create trigger pending_payments_on_void before update on public.pending_payments
  for each row when (new.voided_at is not null and old.voided_at is null) execute function private.on_payment_void();

-- Pagar ---------------------------------------------------------------------------

create function private.pay_pending_expense(p_payment uuid, p_pending uuid, p_amount numeric, p_shift uuid default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.pending_expenses;
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_expense uuid;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v from public.pending_expenses p where p.id = p_pending for update;
  if v.id is null or not private.can_use_branch(v.branch_id) then
    raise exception 'Ese pendiente ya no existe.' using errcode = 'P0001';
  end if;
  -- El mismo pago enviado dos veces (doble clic, reintento): ya quedó guardado.
  if exists (select 1 from public.pending_payments x where x.id = p_payment) then
    return;
  end if;
  if v.canceled_at is not null then
    raise exception 'Ese pendiente está cancelado.' using errcode = 'P0001';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Escribe cuánto pagas.' using errcode = 'P0001';
  end if;
  if v_amount > v.amount - private.pending_paid(v.id) then
    raise exception 'Es más de lo que falta pagar.' using errcode = 'P0001';
  end if;

  if p_shift is not null then
    -- De la caja: como cualquier gasto, solo quien trabaja en la sucursal y con el turno abierto
    -- (require_open_shift lo exige y pone el día del turno).
    if not private.works_in_branch(v.branch_id) then
      raise exception 'Para pagar de la caja tienes que trabajar en esta sucursal.' using errcode = '42501';
    end if;
    insert into public.expenses (branch_id, shift_id, concept, category, amount, owed_on)
    values (v.branch_id, p_shift, v.concept, v.category, v_amount, v.owed_on)
    returning id into v_expense;
  elsif not (private.owns_branch(v.branch_id) or private.works_in_branch(v.branch_id)) then
    raise exception 'No puedes registrar pagos en esta sucursal.' using errcode = '42501';
  end if;

  insert into public.pending_payments (id, pending_id, branch_id, amount, expense_id)
  values (p_payment, v.id, v.branch_id, v_amount, v_expense);
end;
$$;
revoke execute on function private.pay_pending_expense(uuid, uuid, numeric, uuid) from public, anon;
grant execute on function private.pay_pending_expense(uuid, uuid, numeric, uuid) to authenticated;

create function public.pay_pending_expense(p_payment uuid, p_pending uuid, p_amount numeric, p_shift uuid default null) returns void
language sql set search_path = ''
as $$ select private.pay_pending_expense(p_payment, p_pending, p_amount, p_shift) $$;
revoke execute on function public.pay_pending_expense(uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.pay_pending_expense(uuid, uuid, numeric, uuid) to authenticated;

-- Generar los períodos ------------------------------------------------------------

-- Cada período hasta hoy que falte, de todos los gastos fijos activos (o de uno). Se pone al día solo
-- si un día no corrió. Las fechas se cuentan siempre desde starts_on: el 31 cae el 30 o el 28 y vuelve al 31.
create function private.generate_fixed_expenses(p_fixed uuid default null) returns void
language sql security definer set search_path = ''
as $$
  insert into public.pending_expenses (branch_id, fixed_expense_id, owed_on, due_on, concept, category, amount, created_by)
  select f.branch_id, f.id, d.owed_on, d.owed_on + f.grace_days, f.concept, f.category, f.amount, null
  from public.fixed_expenses f
  cross join lateral (
    select case f.frequency
        when 'mensual' then (f.starts_on + make_interval(months => n))::date
        when 'quincenal' then f.starts_on + n * 14
        else f.starts_on + n * 7
      end as owed_on
    -- Cota: ningún período es más corto que 7 días.
    from generate_series(0, (private.today() - f.starts_on) / 7) n
  ) d
  where f.archived_at is null and (p_fixed is null or f.id = p_fixed) and d.owed_on <= private.today()
  on conflict (fixed_expense_id, owed_on) do nothing
$$;
revoke execute on function private.generate_fixed_expenses(uuid) from public, anon, authenticated;

create function private.on_fixed_expense_saved() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.generate_fixed_expenses(new.id);
  return null;
end;
$$;
revoke execute on function private.on_fixed_expense_saved() from public, anon, authenticated;
create trigger fixed_expenses_generate after insert or update on public.fixed_expenses
  for each row execute function private.on_fixed_expense_saved();

-- 04:05 UTC = 00:05 en Bolivia.
select cron.schedule('fixed-expenses', '5 4 * * *', 'select private.generate_fixed_expenses()');

-- En vivo -------------------------------------------------------------------------

create trigger pending_expenses_broadcast after insert or update or delete on public.pending_expenses
  for each row execute function private.broadcast_till();
create trigger pending_payments_broadcast after insert or update or delete on public.pending_payments
  for each row execute function private.broadcast_till();
