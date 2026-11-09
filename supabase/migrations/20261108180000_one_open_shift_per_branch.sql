-- Una sola caja abierta por sucursal: el turno siguiente no se abre (ni se reabre otro) hasta cerrar el que sigue en curso.
-- Vale también para la dueña. Y si un turno sigue abierto 5 minutos después de su hora de cierre, aviso `shift_overdue`
-- a la dueña y a quien lo abrió.

-- El nombre empieza después de shift_closes_force_open: el estado ya viene puesto al insertar.
create function private.one_open_per_branch() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_other text;
begin
  if new.status <> 'en-curso' or (tg_op = 'UPDATE' and old.status = 'en-curso') then
    return new;
  end if;
  select s.name into v_other
  from public.shift_closes c join public.shifts s on s.id = c.shift_id
  where c.branch_id = new.branch_id and c.status = 'en-curso' and c.id <> new.id
  limit 1;
  if v_other is not null then
    raise exception 'El turno % sigue abierto. Ciérralo antes de abrir el turno %.',
      lower(v_other), lower((select s.name from public.shifts s where s.id = new.shift_id))
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.one_open_per_branch() from public, anon, authenticated;

create trigger shift_closes_one_open before insert or update of status on public.shift_closes
  for each row execute function private.one_open_per_branch();

-- Respaldo si dos aperturas llegan a la vez.
create unique index shift_closes_one_open_per_branch_idx on public.shift_closes (branch_id) where status = 'en-curso';

alter type public.notification_kind add value if not exists 'shift_overdue';

-- Igual que en 20261105160000_shift_reminders.sql, más el aviso de turno sin cerrar.
create or replace function private.shift_reminders() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamp := date_trunc('minute', now() at time zone 'America/La_Paz');
  v_minute int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  r record;
  v_open public.shift_closes;
  v_data jsonb;
begin
  -- shortcut: si el cron se salta un minuto, ese recordatorio no sale; si hace falta, guardar cuáles ya se mandaron.
  for r in
    select s.id, s.name, to_char(s.start_time, 'HH24:MI') as start, to_char(s.end_time, 'HH24:MI') as end_at,
           br.business_id, br.name as branch, b.owner_id,
           -- Minutos hasta la hora de abrir (cruza la medianoche: 00:30 se avisa a las 23:30).
           ((extract(hour from s.start_time)::int * 60 + extract(minute from s.start_time)::int - v_minute) % 1440 + 1440) % 1440 as until,
           -- Minutos desde la hora de cierre.
           ((v_minute - extract(hour from s.end_time)::int * 60 - extract(minute from s.end_time)::int) % 1440 + 1440) % 1440 as past_end
    from public.shifts s
    join public.branches br on br.id = s.branch_id
    join public.businesses b on b.id = br.business_id
    where s.archived_at is null
  loop
    select * into v_open from public.shift_closes c where c.shift_id = r.id and c.status = 'en-curso';
    if v_open.id is not null then
      -- Abierto 5 minutos después de su hora de cierre (un turno olvidado vuelve a avisar cada día a esa hora).
      if r.past_end = 5 then
        v_data := jsonb_build_object('branch', r.branch, 'shift', r.name, 'end', r.end_at, 'person', private.full_name(v_open.opened_by));
        perform private.notify(r.owner_id, 'shift_overdue', r.business_id, null, v_data);
        if v_open.opened_by is not null and v_open.opened_by <> r.owner_id then
          perform private.notify(v_open.opened_by, 'shift_overdue', r.business_id, null, v_data);
        end if;
      end if;
      continue;
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
