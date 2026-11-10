-- Borrar una cuenta fallaba si la persona había abierto o cerrado un turno, o registrado o anulado un gasto:
-- shift_closes_opened_by_fkey. Las claves a profiles son «on delete set null», pero on_shift_close y
-- on_expense_update vuelven a poner quién lo hizo (new.x := old.x) en cada update, también en el que hace la clave
-- al borrar la persona, y la fila queda apuntando a un perfil que ya no existe.
-- Ahora un null que llega desde la clave foránea (un update dentro de otro trigger: pg_trigger_depth() > 1) se
-- respeta. Un update normal (la app, depth 1) sigue sin poder cambiar quién abrió, cerró o anuló.

create or replace function private.on_shift_close() returns trigger
language plpgsql set search_path = ''
as $$
declare
  -- Lo que pidió el update, antes de que este trigger lo pise.
  v_opened_by uuid := new.opened_by;
  v_closed_by uuid := new.closed_by;
  v_reopened_by uuid := new.reopened_by;
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
  -- Se borró la cuenta de quien lo hizo (on delete set null).
  if pg_trigger_depth() > 1 then
    if v_opened_by is null then new.opened_by := null; end if;
    if v_closed_by is null then new.closed_by := null; end if;
    if v_reopened_by is null then new.reopened_by := null; end if;
  end if;
  return new;
end;
$$;

create or replace function private.on_expense_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_recorded_by uuid := new.recorded_by;
  v_voided_by uuid := new.voided_by;
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
  -- Se borró la cuenta de quien lo hizo (on delete set null).
  if pg_trigger_depth() > 1 then
    if v_recorded_by is null then new.recorded_by := null; end if;
    if v_voided_by is null then new.voided_by := null; end if;
  end if;
  return new;
end;
$$;

-- Y los negocios propios se borran antes que la persona, en un paso aparte: si caen en cascada junto con los «set
-- null» del perfil, una misma fila de gastos se actualiza dos veces y la segunda revisa una sucursal ya borrada
-- (expenses_branch_id_fkey).
create or replace function private.delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Inicia sesión para seguir.' using errcode = '42501';
  end if;
  -- Security definer salta RLS, y con ella la política de la verificación en dos pasos: se exige aquí.
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  delete from public.businesses where owner_id = v_me;
  delete from public.employees where person_id = v_me;
  delete from auth.users where id = v_me;
end;
$$;
