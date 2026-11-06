-- Recordatorios de turno: 60, 30, 15 y 5 minutos antes de la hora de abrir, a quienes trabajan en el turno
-- (o a la dueña si nadie está asignado). Si a los 5 minutos de la hora el turno sigue sin abrir, aviso a la dueña.
-- Un cron cada minuto; las horas son de Bolivia.

alter type public.notification_kind add value if not exists 'shift_reminder';
alter type public.notification_kind add value if not exists 'shift_late';

create function private.shift_reminders() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamp := date_trunc('minute', now() at time zone 'America/La_Paz');
  v_minute int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  r record;
  v_data jsonb;
begin
  -- shortcut: si el cron se salta un minuto, ese recordatorio no sale; si hace falta, guardar cuáles ya se mandaron.
  for r in
    select s.id, s.name, to_char(s.start_time, 'HH24:MI') as start, br.business_id, br.name as branch, b.owner_id,
           -- Minutos hasta la hora de abrir (cruza la medianoche: 00:30 se avisa a las 23:30).
           ((extract(hour from s.start_time)::int * 60 + extract(minute from s.start_time)::int - v_minute) % 1440 + 1440) % 1440 as until
    from public.shifts s
    join public.branches br on br.id = s.branch_id
    join public.businesses b on b.id = br.business_id
    where s.archived_at is null
  loop
    if exists (select 1 from public.shift_closes c where c.shift_id = r.id and c.status = 'en-curso') then
      continue; -- ya está abierto
    end if;

    if r.until in (60, 30, 15, 5) then
      v_data := jsonb_build_object('branch', r.branch, 'shift', r.name, 'start', r.start, 'minutes', r.until);
      if exists (select 1 from public.employees e where e.shift_id = r.id and e.status = 'activo' and e.person_id is not null) then
        perform private.notify(e.person_id, 'shift_reminder', r.business_id, e.id, v_data)
        from public.employees e where e.shift_id = r.id and e.status = 'activo' and e.person_id is not null;
      else
        perform private.notify(r.owner_id, 'shift_reminder', r.business_id, null, v_data);
      end if;
    elsif r.until = 1435 -- 5 minutos tarde
      and not exists (select 1 from public.shift_closes c
                      where c.shift_id = r.id and c.business_date = (v_now - interval '5 minutes')::date) then
      perform private.notify(r.owner_id, 'shift_late', r.business_id, null, jsonb_build_object(
        'branch', r.branch, 'shift', r.name, 'start', r.start
      ));
    end if;
  end loop;
end;
$$;

revoke execute on function private.shift_reminders() from public, anon, authenticated;

select cron.schedule('shift-reminders', '* * * * *', 'select private.shift_reminders()');
