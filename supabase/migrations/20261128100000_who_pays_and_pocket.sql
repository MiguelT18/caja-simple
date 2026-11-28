-- Quién paga cada pendiente y pagos de bolsillo.
-- payer: «sucursal» (lo salda quien trabaja ahí, de la caja; como hasta ahora) o «dueña» (solo ella lo paga). Lo
-- decide la dueña en el pendiente o en el gasto fijo, que lo pasa a cada período.
-- Pago de bolsillo: la empleada paga todo o parte de un pendiente con su plata. Queda como pago fuera de la caja (es
-- gasto del negocio, no de un turno) y nace un pendiente aparte, «Reembolso: …», a su nombre (employee_id), que paga
-- la dueña y la empleada confirma con «Me pagaron», como un sueldo.

alter table public.pending_expenses
  add column payer text not null default 'sucursal' check (payer in ('sucursal', 'dueña')),
  add column reimbursement boolean not null default false;
alter table public.fixed_expenses
  add column payer text not null default 'sucursal' check (payer in ('sucursal', 'dueña'));
grant insert (payer), update (payer) on public.pending_expenses to authenticated;
grant insert (payer), update (payer) on public.fixed_expenses to authenticated;

-- La vista se armó con p.*: se recrea para que traiga payer y reimbursement.
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

-- Solo la dueña decide quién paga: lo que mande otra persona por la API se ignora. Las funciones de la base (el
-- reembolso, los períodos de un gasto fijo) no pasan por aquí: current_user es su dueño, no «authenticated».
-- security invoker: así current_user es quien escribe.
create function private.keep_payer() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not private.owns_branch(new.branch_id) then
    new.payer := case when tg_op = 'INSERT' then 'sucursal' else old.payer end;
  end if;
  return new;
end;
$$;
revoke execute on function private.keep_payer() from public, anon;
create trigger pending_expenses_keep_payer before insert or update of payer on public.pending_expenses
  for each row execute function private.keep_payer();

-- Cada período lleva el «quién paga» de su gasto fijo.
create or replace function private.generate_fixed_expenses(p_fixed uuid default null) returns void
language sql security definer set search_path = ''
as $$
  insert into public.pending_expenses (branch_id, fixed_expense_id, employee_id, owed_on, due_on, concept, category, amount, created_by, payer)
  select f.branch_id, f.id, f.employee_id, d.owed_on, d.owed_on + f.grace_days, f.concept, f.category, f.amount, null, f.payer
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

-- Pagar un pendiente: igual que antes, y uno que paga la dueña no lo salda nadie más.
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
  if v.payer = 'dueña' and not v_owner and not v_own_salary then
    raise exception 'Este pago lo hace la dueña.' using errcode = '42501';
  end if;
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

-- Pago de bolsillo de quien trabaja en la sucursal (todo o una parte). p_payment también es el id del reembolso.
create function private.pay_pending_from_pocket(p_payment uuid, p_pending uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.pending_expenses;
  v_amount numeric(12, 2) := round(p_amount, 2);
  v_employee uuid;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v from public.pending_expenses p where p.id = p_pending for update;
  if v.id is null or not private.can_use_branch(v.branch_id) then
    raise exception 'Ese pendiente ya no existe.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pending_payments x where x.id = p_payment) then
    return;
  end if;
  if v.canceled_at is not null then
    raise exception 'Ese pendiente está cancelado.' using errcode = 'P0001';
  end if;
  if v.payer = 'dueña' or v.reimbursement or v.employee_id is not null then
    raise exception 'Este pago lo hace la dueña.' using errcode = '42501';
  end if;
  if private.owns_branch(v.branch_id) then
    raise exception 'Tú lo pagas con «Pagar», fuera de la caja.' using errcode = 'P0001';
  end if;
  select e.id into v_employee from public.employees e
  where e.person_id = (select auth.uid()) and e.branch_id = v.branch_id and e.status = 'activo';
  if v_employee is null then
    raise exception 'Solo quien trabaja en esta sucursal paga de su bolsillo.' using errcode = '42501';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Escribe cuánto pagaste.' using errcode = 'P0001';
  end if;
  if v_amount > v.amount - private.pending_paid(v.id) then
    raise exception 'Es más de lo que falta pagar.' using errcode = 'P0001';
  end if;

  insert into public.pending_payments (id, pending_id, branch_id, amount, expense_id)
  values (p_payment, v.id, v.branch_id, v_amount, null);
  insert into public.pending_expenses (id, branch_id, owed_on, concept, category, amount, created_by, employee_id, payer, reimbursement)
  values (p_payment, v.branch_id, private.today(), left('Reembolso: ' || v.concept, 120), 'Reembolsos', v_amount, (select auth.uid()), v_employee, 'dueña', true);
end;
$$;

create function public.pay_pending_from_pocket(p_payment uuid, p_pending uuid, p_amount numeric) returns void
language sql security invoker set search_path = ''
as $$ select private.pay_pending_from_pocket(p_payment, p_pending, p_amount) $$;
revoke execute on function private.pay_pending_from_pocket(uuid, uuid, numeric), public.pay_pending_from_pocket(uuid, uuid, numeric) from public, anon;
grant execute on function private.pay_pending_from_pocket(uuid, uuid, numeric), public.pay_pending_from_pocket(uuid, uuid, numeric) to authenticated;
