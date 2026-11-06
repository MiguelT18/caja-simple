-- Quien trabaja en la sucursal solo abre el turno al que está asignado (y dentro de su horario). La dueña de la sucursal abre
-- cualquiera, a cualquier hora: la app le pide confirmarlo. Reemplaza private.check_shift_schedule
-- (20261103120000_open_shift_on_schedule.sql); el trigger shift_closes_check_schedule sigue igual.

create or replace function private.check_shift_schedule() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_start time;
  v_end time;
  v_name text;
begin
  if private.owns_branch(new.branch_id) then
    return new;
  end if;
  select s.start_time, s.end_time, s.name into v_start, v_end, v_name from public.shifts s where s.id = new.shift_id;
  if not exists (
    select 1 from public.employees e
    where e.person_id = (select auth.uid())
      and e.branch_id = new.branch_id
      and e.shift_id = new.shift_id
      and e.status = 'activo'
  ) then
    raise exception 'Solo puedes abrir tu propio turno. El turno % lo abre quien trabaja en él o quien administra el negocio.',
      lower(v_name)
      using errcode = 'P0001';
  end if;
  if not private.in_shift_window(v_start, v_end, (now() at time zone 'America/La_Paz')::time) then
    raise exception 'El turno % se abre de % a %. Fuera de ese horario, solo quien administra el negocio puede abrirlo.',
      lower(v_name), to_char(v_start - interval '15 minutes', 'HH24:MI'), to_char(v_end, 'HH24:MI')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
