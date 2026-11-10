-- Días hábiles: qué días trabaja cada turno, el horario semanal de la sucursal y los cierres de fechas sueltas
-- (feriados: todo el día, de tal hora a tal hora o solo algunos turnos). Un turno no abre el día D si:
--   1. hay un cierre ese día que lo alcanza (todo el día, su hora de inicio cae en el rango, o está entre los elegidos);
--   2. la sucursal tiene horario ese día y la hora de inicio del turno cae fuera (o ese día no abre);
--   3. el turno no trabaja ese día de la semana (shifts.weekdays).
-- La empleada no lo abre; la dueña sí (la app le pide confirmarlo). El cron no manda recordatorios ni «sin abrir».
-- src/lib/schedule.ts (closedReason) repite la cuenta para mostrarla en Turnos.

alter table public.shifts
  add column weekdays smallint[] check (cardinality(weekdays) > 0 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);
comment on column public.shifts.weekdays is 'Días ISO (1 = lunes … 7 = domingo) en que trabaja; null = todos los días.';

-- Sin fila para un día: abre todo el día. Con las dos horas en null: ese día no abre.
create table public.branch_hours (
  branch_id uuid not null references public.branches (id) on delete cascade,
  dow smallint not null check (dow between 1 and 7),
  open_time time,
  close_time time,
  primary key (branch_id, dow),
  check ((open_time is null) = (close_time is null) and (open_time is null or close_time > open_time))
);

create table public.branch_closures (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  day date not null,
  start_time time,
  end_time time,
  shift_ids uuid[] check (cardinality(shift_ids) > 0),
  note text check (char_length(note) <= 80),
  created_at timestamptz not null default now(),
  -- Todo el día (nada), un rango de horas o algunos turnos; no las dos cosas.
  check ((start_time is null) = (end_time is null) and (start_time is null or end_time > start_time)),
  check (start_time is null or shift_ids is null)
);
create index branch_closures_branch_day_idx on public.branch_closures (branch_id, day);

alter table public.branch_hours enable row level security;
create policy "Ver el horario de tus sucursales" on public.branch_hours for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "La dueña crea el horario" on public.branch_hours for insert to authenticated
  with check ((select private.owns_branch(branch_id)));
create policy "La dueña edita el horario" on public.branch_hours for update to authenticated
  using ((select private.owns_branch(branch_id))) with check ((select private.owns_branch(branch_id)));
create policy "La dueña borra el horario" on public.branch_hours for delete to authenticated
  using ((select private.owns_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.branch_hours as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.branch_hours from anon;

alter table public.branch_closures enable row level security;
create policy "Ver los cierres de tus sucursales" on public.branch_closures for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "La dueña crea cierres" on public.branch_closures for insert to authenticated
  with check ((select private.owns_branch(branch_id)));
create policy "La dueña edita cierres" on public.branch_closures for update to authenticated
  using ((select private.owns_branch(branch_id))) with check ((select private.owns_branch(branch_id)));
create policy "La dueña borra cierres" on public.branch_closures for delete to authenticated
  using ((select private.owns_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.branch_closures as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.branch_closures from anon;

-- Por qué el turno no trabaja el día p_date (fecha de caja), o null si trabaja.
create function private.shift_closed_reason(p_shift uuid, p_date date) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_dow smallint := extract(isodow from p_date)::smallint;
  v_day text := (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'])[extract(isodow from p_date)::int];
  v_closure public.branch_closures;
  v_hours public.branch_hours;
begin
  select * into v_shift from public.shifts s where s.id = p_shift;
  if v_shift.id is null then
    return null;
  end if;

  select * into v_closure from public.branch_closures c
  where c.branch_id = v_shift.branch_id and c.day = p_date
    and ((c.start_time is null and c.shift_ids is null)
         or (v_shift.start_time >= c.start_time and v_shift.start_time < c.end_time)
         or v_shift.id = any (c.shift_ids))
  order by c.created_at limit 1;
  if v_closure.id is not null then
    return 'Cerrado'
      || case when v_closure.start_time is not null
           then ' de ' || to_char(v_closure.start_time, 'HH24:MI') || ' a ' || to_char(v_closure.end_time, 'HH24:MI') else '' end
      || coalesce(': ' || nullif(trim(v_closure.note), ''), '');
  end if;

  select * into v_hours from public.branch_hours h where h.branch_id = v_shift.branch_id and h.dow = v_dow;
  if v_hours.branch_id is not null then
    if v_hours.open_time is null then
      return 'La sucursal no abre los ' || v_day;
    elsif v_shift.start_time < v_hours.open_time or v_shift.start_time >= v_hours.close_time then
      return 'Los ' || v_day || ' la sucursal abre de ' || to_char(v_hours.open_time, 'HH24:MI') || ' a ' || to_char(v_hours.close_time, 'HH24:MI');
    end if;
  end if;

  if v_shift.weekdays is not null and not (v_dow = any (v_shift.weekdays)) then
    return 'El turno ' || lower(v_shift.name) || ' no trabaja los ' || v_day;
  end if;
  return null;
end;
$$;
revoke execute on function private.shift_closed_reason(uuid, date) from public, anon, authenticated;

-- Igual que en 20261105140000_open_only_own_shift.sql, más los días hábiles.
create or replace function private.check_shift_schedule() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_start time;
  v_end time;
  v_name text;
  v_reason text;
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
  v_reason := private.shift_closed_reason(new.shift_id, private.shift_date(new.shift_id));
  if v_reason is not null then
    raise exception '%. Ese día, solo quien administra el negocio puede abrir el turno %.', v_reason, lower(v_name)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Igual que en 20261108180000_one_open_shift_per_branch.sql, sin recordatorios ni «sin abrir» en días que no trabaja.
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
      -- El día en que empieza (a las 23:30, el de un turno de 00:30 es mañana).
      continue when private.shift_closed_reason(r.id, (v_now + r.until * interval '1 minute')::date) is not null;
      v_data := jsonb_build_object('branch', r.branch, 'shift', r.name, 'start', r.start, 'minutes', r.until);
      if exists (select 1 from public.employees e where e.shift_id = r.id and e.status = 'activo' and e.person_id is not null) then
        perform private.notify(e.person_id, 'shift_reminder', r.business_id, e.id, v_data)
        from public.employees e where e.shift_id = r.id and e.status = 'activo' and e.person_id is not null;
      else
        perform private.notify(r.owner_id, 'shift_reminder', r.business_id, null, v_data);
      end if;
    elsif r.until = 1435 -- 5 minutos tarde
      and private.shift_closed_reason(r.id, (v_now - interval '5 minutes')::date) is null
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
