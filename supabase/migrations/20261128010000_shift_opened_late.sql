-- Turno abierto tarde: abrirlo dentro de su horario ya se permite (check_shift_schedule: de 15 min antes hasta el fin);
-- si se abre más de 5 minutos después de la hora de inicio, la dueña recibe `shift_opened_late` con quién y a qué hora.

alter type public.notification_kind add value if not exists 'shift_opened_late';

create function private.notify_opened_late() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_now time := (now() at time zone 'America/La_Paz')::time;
  v_shift public.shifts;
  v_branch public.branches;
  v_owner uuid;
  v_late int;
begin
  select * into v_shift from public.shifts s where s.id = new.shift_id;
  select * into v_branch from public.branches br where br.id = new.branch_id;
  select b.owner_id into v_owner from public.businesses b where b.id = v_branch.business_id;
  -- Minutos desde la hora de inicio, dando la vuelta a la medianoche. La ventana abre 15 min antes, así que 1425+ es temprano.
  v_late := mod((extract(epoch from v_now)::int / 60 - extract(epoch from v_shift.start_time)::int / 60) + 1440, 1440);
  if v_late > 5 and v_late < 1425 and new.opened_by is distinct from v_owner then
    perform private.notify(v_owner, 'shift_opened_late', v_branch.business_id, null, jsonb_build_object(
      'branch', v_branch.name, 'shift', v_shift.name, 'start', to_char(v_shift.start_time, 'HH24:MI'),
      'opened', to_char(v_now, 'HH24:MI'), 'minutes', v_late, 'person', private.full_name(new.opened_by)
    ));
  end if;
  return null;
end;
$$;
revoke execute on function private.notify_opened_late() from public, anon, authenticated;

create trigger shift_closes_notify_opened_late after insert on public.shift_closes
  for each row execute function private.notify_opened_late();
