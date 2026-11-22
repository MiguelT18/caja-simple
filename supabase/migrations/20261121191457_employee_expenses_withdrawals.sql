-- La empleada en Gastos, sueldos por persona y retiros de la dueña.
-- * Pendientes: los anota solo la dueña. La empleada los salda completos y de la caja; su propio sueldo
--   también puede marcarlo pagado fuera de la caja («me pagó la dueña»).
-- * Sueldos: un gasto fijo puede ser el sueldo de una ficha de la sucursal, y se suma la frecuencia diaria.
-- * Retiros (cash_withdrawals): efectivo que se lleva la dueña. Baja el esperado del turno pero no es un gasto.
-- * Avisos: la dueña se entera de cada gasto y retiro que registra otra persona.

alter type public.expense_frequency add value if not exists 'diario';
alter type public.notification_kind add value if not exists 'expense_added';
alter type public.notification_kind add value if not exists 'cash_withdrawal';

-- Sueldos -------------------------------------------------------------------------

alter table public.fixed_expenses add column employee_id uuid references public.employees (id) on delete set null;
alter table public.pending_expenses add column employee_id uuid references public.employees (id) on delete set null;
create index fixed_expenses_employee_idx on public.fixed_expenses (employee_id);
create index pending_expenses_employee_idx on public.pending_expenses (employee_id);
grant insert (employee_id) on public.fixed_expenses to authenticated;
grant update (employee_id) on public.fixed_expenses to authenticated;

-- La vista se armó con p.*: se recrea para que traiga employee_id.
drop view public.pending_balances;
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

-- El sueldo es de alguien que trabaja en esa sucursal.
create function private.check_fixed_employee() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.employee_id is not null
     and not exists (select 1 from public.employees e where e.id = new.employee_id and e.branch_id = new.branch_id) then
    raise exception 'Esa persona no trabaja en esta sucursal.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_fixed_employee() from public, anon, authenticated;
create trigger fixed_expenses_check_employee before insert or update of employee_id, branch_id on public.fixed_expenses
  for each row execute function private.check_fixed_employee();

-- Igual que antes, con la frecuencia diaria y la ficha del sueldo. Se compara como texto: el valor nuevo
-- del enum no se puede usar en la misma transacción que lo crea.
create or replace function private.generate_fixed_expenses(p_fixed uuid default null) returns void
language sql security definer set search_path = ''
as $$
  insert into public.pending_expenses (branch_id, fixed_expense_id, employee_id, owed_on, due_on, concept, category, amount, created_by)
  select f.branch_id, f.id, f.employee_id, d.owed_on, d.owed_on + f.grace_days, f.concept, f.category, f.amount, null
  from public.fixed_expenses f
  cross join lateral (
    select case f.frequency::text
        when 'mensual' then (f.starts_on + make_interval(months => n))::date
        when 'quincenal' then f.starts_on + n * 14
        when 'semanal' then f.starts_on + n * 7
        else f.starts_on + n
      end as owed_on
    -- Cota: ningún período es más corto que un día.
    from generate_series(0, private.today() - f.starts_on) n
  ) d
  where f.archived_at is null and (p_fixed is null or f.id = p_fixed) and d.owed_on <= private.today()
  on conflict (fixed_expense_id, owed_on) do nothing
$$;

-- Pendientes: solo la dueña anota -----------------------------------------------------

drop policy "Anotar pendientes en tus sucursales" on public.pending_expenses;
create policy "La dueña anota pendientes" on public.pending_expenses for insert to authenticated
  with check ((select private.owns_branch(branch_id)) and created_by = (select auth.uid()) and fixed_expense_id is null);

-- Pagar: la dueña, como antes; la empleada, completo y de la caja (o su propio sueldo, también fuera).
create or replace function private.pay_pending_expense(p_payment uuid, p_pending uuid, p_amount numeric, p_shift uuid default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.pending_expenses;
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_balance numeric(12, 2);
  v_owner boolean;
  v_own_salary boolean;
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
  v_balance := v.amount - private.pending_paid(v.id);
  if v_amount > v_balance then
    raise exception 'Es más de lo que falta pagar.' using errcode = 'P0001';
  end if;
  v_owner := private.owns_branch(v.branch_id);
  v_own_salary := v.employee_id is not null
    and exists (select 1 from public.employees e where e.id = v.employee_id and e.person_id = (select auth.uid()));
  if not v_owner and v_amount <> v_balance then
    raise exception 'Salda el monto completo: falta Bs %.', to_char(v_balance, 'FM999990D00') using errcode = 'P0001';
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
  elsif not (v_owner or v_own_salary) then
    raise exception 'Solo la dueña registra pagos fuera de la caja.' using errcode = '42501';
  end if;

  insert into public.pending_payments (id, pending_id, branch_id, amount, expense_id)
  values (p_payment, v.id, v.branch_id, v_amount, v_expense);
end;
$$;

-- Retiros ---------------------------------------------------------------------------

create table public.cash_withdrawals (
  -- Lo manda el navegador: el mismo retiro enviado dos veces no se repite.
  id uuid primary key,
  branch_id uuid not null,
  shift_id uuid not null,
  business_date date not null default private.today(),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 9999999),
  note text check (char_length(note) <= 120),
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  foreign key (shift_id, branch_id) references public.shifts (id, branch_id) on delete cascade,
  foreign key (branch_id) references public.branches (id) on delete cascade
);
create index cash_withdrawals_shift_idx on public.cash_withdrawals (shift_id, branch_id);
create index cash_withdrawals_branch_date_idx on public.cash_withdrawals (branch_id, business_date);
create index cash_withdrawals_recorded_by_idx on public.cash_withdrawals (recorded_by);
create index cash_withdrawals_voided_by_idx on public.cash_withdrawals (voided_by);

alter table public.cash_withdrawals enable row level security;
create policy "Ver los retiros de tus sucursales" on public.cash_withdrawals for select to authenticated
  using ((select private.can_use_branch(branch_id)) and business_date >= private.history_start(branch_id));
-- La única excepción a «la dueña no opera la caja»: se lleva las ganancias.
create policy "Registrar retiros: la dueña o quien trabaja ahí" on public.cash_withdrawals for insert to authenticated
  with check (
    ((select private.owns_branch(branch_id)) or (select private.works_in_branch(branch_id)))
    and recorded_by = (select auth.uid())
  );
create policy "Anular un retiro: quien lo registró, con el turno abierto" on public.cash_withdrawals for update to authenticated
  using (voided_at is null and recorded_by = (select auth.uid()) and (select private.shift_open(shift_id, business_date)))
  with check ((select private.can_use_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.cash_withdrawals as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.cash_withdrawals from anon, authenticated;
grant select on public.cash_withdrawals to authenticated;
grant insert (id, branch_id, shift_id, amount, note) on public.cash_withdrawals to authenticated;
grant update (voided_at) on public.cash_withdrawals to authenticated;

-- Turno abierto y día del turno, como un gasto, pero sin exigir ficha: la dueña también retira.
create function private.withdrawal_open_shift() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_date date;
begin
  select c.business_date into v_date from public.shift_closes c
  where c.shift_id = new.shift_id and c.branch_id = new.branch_id and c.status = 'en-curso';
  if v_date is null then
    raise exception 'El turno no está abierto: el retiro sale de la caja de un turno abierto.' using errcode = 'P0001';
  end if;
  new.business_date := v_date;
  return new;
end;
$$;
revoke execute on function private.withdrawal_open_shift() from public, anon, authenticated;
create trigger cash_withdrawals_require_open_shift before insert on public.cash_withdrawals
  for each row execute function private.withdrawal_open_shift();
create trigger cash_withdrawals_on_void before update on public.cash_withdrawals
  for each row when (new.voided_at is not null and old.voided_at is null) execute function private.on_payment_void();
create trigger cash_withdrawals_broadcast after insert or update or delete on public.cash_withdrawals
  for each row execute function private.broadcast_till();

-- El esperado en caja descuenta los retiros (mismo cálculo que shiftCash() en src/data/cash.ts).
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

  -- Mismo cálculo que shiftCash() en src/data/cash.ts: solo el efectivo entra al cajón.
  v_expected := new.opening
    + coalesce((select sum(t.total) from public.sale_totals t
                where t.shift_id = new.shift_id and t.business_date = new.business_date
                  and t.payment_method = 'efectivo' and t.voided_at is null), 0)
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

-- Avisos a la dueña -------------------------------------------------------------------

-- Un gasto o un retiro que registra otra persona. El pago de un pendiente (owed_on) no avisa: lo anotó ella.
create function private.notify_till_out() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_owner uuid;
begin
  -- Por JSON: los retiros no tienen owed_on (PL/pgSQL no corta el «and»).
  if to_jsonb(new) ->> 'owed_on' is not null then
    return null;
  end if;
  select br.business_id, b.owner_id into v_business, v_owner
  from public.branches br join public.businesses b on b.id = br.business_id
  where br.id = new.branch_id;
  if v_owner is null or v_owner = new.recorded_by then
    return null;
  end if;
  perform private.notify(
    v_owner,
    (case tg_table_name when 'expenses' then 'expense_added' else 'cash_withdrawal' end)::public.notification_kind,
    v_business,
    null,
    jsonb_build_object(
      'branch', (select br.name from public.branches br where br.id = new.branch_id),
      'person', (select p.first_name from public.profiles p where p.id = new.recorded_by),
      'concept', case tg_table_name when 'expenses' then to_jsonb(new) ->> 'concept' else to_jsonb(new) ->> 'note' end,
      'amount', new.amount
    )
  );
  return null;
exception when others then
  -- El aviso nunca impide guardar el movimiento.
  raise warning 'notify_till_out: %', sqlerrm;
  return null;
end;
$$;
revoke execute on function private.notify_till_out() from public, anon, authenticated;
create trigger expenses_notify_owner after insert on public.expenses
  for each row execute function private.notify_till_out();
create trigger cash_withdrawals_notify_owner after insert on public.cash_withdrawals
  for each row execute function private.notify_till_out();
