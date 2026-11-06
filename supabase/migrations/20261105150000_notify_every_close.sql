-- La dueña recibe un aviso por cada turno que cierre otra persona, cuadre o no, en todos los planes
-- (antes: solo con diferencia y solo en planes pagos, como cash_mismatch). Los cash_mismatch viejos se siguen mostrando.

alter type public.notification_kind add value if not exists 'shift_closed';

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
                where g.shift_id = new.shift_id and g.business_date = new.business_date and g.voided_at is null), 0);
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
