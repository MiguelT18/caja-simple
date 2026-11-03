-- Un turno solo se abre dentro de su horario (desde 15 minutos antes de empezar hasta la hora de cierre),
-- en hora de Bolivia. La dueña de la sucursal puede abrirlo fuera de horario: la app le pide confirmarlo.
-- Mismo cálculo que inShiftWindow() en src/lib/dates.ts.

create function private.in_shift_window(p_start time, p_end time, p_now time) returns boolean
language sql immutable set search_path = ''
as $$
  -- Minutos desde el inicio de la ventana (15 min antes de empezar), dando la vuelta a la medianoche.
  select mod((extract(epoch from p_now)::int / 60 - (extract(epoch from p_start)::int / 60 - 15)) + 2880, 1440)
       < mod((extract(epoch from p_end)::int / 60 - (extract(epoch from p_start)::int / 60 - 15)) + 2880, 1440)
$$;

create function private.check_shift_schedule() returns trigger
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
  if not private.in_shift_window(v_start, v_end, (now() at time zone 'America/La_Paz')::time) then
    raise exception 'El turno % se abre de % a %. Fuera de ese horario, solo quien administra el negocio puede abrirlo.',
      lower(v_name), to_char(v_start - interval '15 minutes', 'HH24:MI'), to_char(v_end, 'HH24:MI')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger shift_closes_check_schedule before insert on public.shift_closes
  for each row execute function private.check_shift_schedule();
