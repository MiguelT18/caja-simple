-- Horas extra acumuladas: al cerrar un turno, el tiempo que estuvo abierto fuera de su horario (antes del inicio o
-- después del cierre; un turno abierto del todo fuera de horario cuenta entero) queda en public.overtime a nombre de
-- quien lo abrió. La dueña decide cada registro: pagada, descontada o repuesta (con otro día u otra persona).
-- Menos de 5 minutos no cuenta, ni el turno que abre la dueña. Un turno reabierto conserva el registro de su primer cierre.

create type public.overtime_status as enum ('pendiente', 'pagada', 'descontada', 'repuesta');

create table public.overtime (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  close_id uuid not null unique references public.shift_closes (id) on delete cascade,
  person_id uuid references public.profiles (id) on delete set null,
  business_date date not null,
  minutes integer not null check (minutes > 0),
  status public.overtime_status not null default 'pendiente',
  note text check (char_length(note) <= 200),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index overtime_business_idx on public.overtime (business_id, business_date desc);
create index overtime_branch_idx on public.overtime (branch_id);
create index overtime_person_idx on public.overtime (person_id);
create index overtime_decided_by_idx on public.overtime (decided_by);

alter table public.overtime enable row level security;
create policy "Ver tus horas extra y las de tu negocio" on public.overtime for select to authenticated
  using (person_id = (select auth.uid()) or (select private.is_owner(business_id)));
create policy "Exige la verificación en dos pasos" on public.overtime as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Se escribe solo con el trigger y decide_overtime.
revoke all on public.overtime from anon, authenticated;
grant select on public.overtime to authenticated;

-- Minutos fuera del horario: lo que estuvo abierto menos lo que coincide con el horario de ese día de caja.
create function private.overtime_minutes(p_opened timestamptz, p_closed timestamptz, p_date date, p_start time, p_end time)
returns integer
language sql immutable set search_path = ''
as $$
  with s as (
    select (p_date + p_start) at time zone 'America/La_Paz' as starts,
           (p_date + p_end + case when p_end <= p_start then interval '1 day' else interval '0' end) at time zone 'America/La_Paz' as ends
  )
  select greatest(0, floor((
    extract(epoch from p_closed - p_opened)
    - greatest(0, extract(epoch from least(p_closed, s.ends) - greatest(p_opened, s.starts)))
  ) / 60))::int
  from s
$$;

create function private.record_overtime() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_minutes int;
begin
  -- Reabierto (quizá días después): se queda el registro del primer cierre, si no contaría los días de por medio.
  if new.reopened_at is not null then
    return null;
  end if;
  -- La dueña que abre su propio turno no se debe horas extra.
  if exists (select 1 from public.branches br join public.businesses b on b.id = br.business_id
             where br.id = new.branch_id and b.owner_id = new.opened_by) then
    return null;
  end if;
  select * into v_shift from public.shifts s where s.id = new.shift_id;
  v_minutes := private.overtime_minutes(new.opened_at, coalesce(new.closed_at, now()), new.business_date, v_shift.start_time, v_shift.end_time);
  if v_minutes < 5 then
    return null;
  end if;
  insert into public.overtime (business_id, branch_id, close_id, person_id, business_date, minutes)
  select br.business_id, new.branch_id, new.id, new.opened_by, new.business_date, v_minutes
  from public.branches br where br.id = new.branch_id
  on conflict (close_id) do nothing;
  return null;
end;
$$;
revoke execute on function private.record_overtime() from public, anon, authenticated;

create trigger shift_closes_record_overtime after update of status on public.shift_closes
  for each row when (old.status = 'en-curso' and new.status = 'cerrado')
  execute function private.record_overtime();

-- La dueña decide qué pasa con un registro (o lo vuelve a pendiente).
create function private.decide_overtime(p_id uuid, p_status public.overtime_status, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.overtime;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_row from public.overtime o where o.id = p_id for update;
  if v_row.id is null or not private.is_owner(v_row.business_id) then
    raise exception 'Solo quien administra el negocio decide las horas extra.' using errcode = '42501';
  end if;
  update public.overtime
  set status = p_status,
      note = coalesce(nullif(btrim(p_note), ''), note),
      decided_by = case when p_status = 'pendiente' then null else (select auth.uid()) end,
      decided_at = case when p_status = 'pendiente' then null else now() end
  where id = p_id;
end;
$$;

create function public.decide_overtime(p_id uuid, p_status public.overtime_status, p_note text default null) returns void
language sql security invoker set search_path = ''
as $$ select private.decide_overtime(p_id, p_status, p_note) $$;

revoke execute on function private.decide_overtime(uuid, public.overtime_status, text), public.decide_overtime(uuid, public.overtime_status, text) from public, anon;
grant execute on function private.decide_overtime(uuid, public.overtime_status, text), public.decide_overtime(uuid, public.overtime_status, text) to authenticated;
revoke execute on function private.overtime_minutes(timestamptz, timestamptz, date, time, time) from public, anon, authenticated;
