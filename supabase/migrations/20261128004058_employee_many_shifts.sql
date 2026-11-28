-- Una empleada puede trabajar en más de un turno de su sucursal: employees.shift_id pasa a shift_ids uuid[]
-- (como business_closures.shift_ids). Sin FK por elemento: un trigger exige que sean de su sucursal y otro
-- los quita al borrar o archivar el turno (antes: on delete set null y la Action de quitar turno).

alter table public.employees add column shift_ids uuid[] not null default '{}';
update public.employees set shift_ids = array[shift_id] where shift_id is not null;
drop index public.employees_shift_idx;
alter table public.employees drop column shift_id;
create index employees_shift_ids_idx on public.employees using gin (shift_ids);

grant insert (shift_ids) on public.employees to authenticated;
grant update (shift_ids) on public.employees to authenticated;

-- Sin repetidos y todos de la sucursal de la empleada.
create or replace function private.check_employee_shifts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.shift_ids := array(select distinct unnest(new.shift_ids));
  if exists (
    select 1 from unnest(new.shift_ids) as x(id)
    where not exists (select 1 from public.shifts s where s.id = x.id and s.branch_id = new.branch_id)
  ) then
    raise exception 'Ese turno es de otra sucursal. Elige turnos de la sucursal de la empleada.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger employees_check_shifts
  before insert or update of shift_ids, branch_id on public.employees
  for each row execute function private.check_employee_shifts();

-- Un turno borrado o quitado (archivado) deja de estar en las empleadas.
create or replace function private.forget_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.employees set shift_ids = array_remove(shift_ids, old.id) where shift_ids @> array[old.id];
  return null;
end;
$$;

create trigger shifts_forget_deleted
  after delete on public.shifts
  for each row execute function private.forget_shift();
create trigger shifts_forget_archived
  after update of archived_at on public.shifts
  for each row when (old.archived_at is null and new.archived_at is not null)
  execute function private.forget_shift();

-- Aceptar un pedido: entra con el turno elegido.
create or replace function private.answer_join(p_request uuid, p_accept boolean, p_branch uuid, p_shift uuid, p_job_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.join_requests;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_request from public.join_requests r where r.id = p_request for update;
  if v_request.id is null or not private.is_owner(v_request.business_id) then
    raise exception 'Solo quien administra el negocio responde estos pedidos.' using errcode = '42501';
  end if;
  if v_request.status <> 'pendiente' then
    raise exception 'Ese pedido ya se respondió.' using errcode = 'P0001';
  end if;

  update public.join_requests
  set status = case when p_accept then 'aceptada'::public.join_status else 'rechazada' end,
      decided_by = (select auth.uid()), decided_at = now()
  where id = p_request;

  if p_accept then
    if not exists (
      select 1 from public.shifts s join public.branches br on br.id = s.branch_id
      where s.id = p_shift and br.id = p_branch and br.business_id = v_request.business_id
    ) then
      raise exception 'Ese turno es de otra sucursal. Elige uno de la sucursal seleccionada.' using errcode = 'P0001';
    end if;
    if coalesce(btrim(p_job_title), '') = '' then
      raise exception 'Escribe el puesto.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.employees e where e.business_id = v_request.business_id and e.person_id = v_request.person_id) then
      raise exception 'Esa persona ya está en tu equipo.' using errcode = 'P0001';
    end if;
    insert into public.employees (business_id, branch_id, shift_ids, person_id, email, job_title)
    values (v_request.business_id, p_branch, array[p_shift], v_request.person_id, '', left(btrim(p_job_title), 60));
  end if;

  update public.notifications set read_at = coalesce(read_at, now())
  where join_request_id = p_request and user_id = (select auth.uid());

  perform private.notify(v_request.person_id, 'join_answer', v_request.business_id, null, jsonb_build_object(
    'accepted', p_accept,
    'business', (select b.name from public.businesses b where b.id = v_request.business_id),
    'person', private.full_name((select auth.uid()))
  ));
end;
$$;

-- El equipo de la sucursal, ahora con todos los turnos de cada una.
drop function public.branch_team(uuid);
drop function private.branch_team(uuid);
create function private.branch_team(p_branch uuid)
returns table (person_id uuid, first_name text, last_name text, avatar_url text, job_title text, shift_ids uuid[], is_owner boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Security definer salta RLS, y con ella la política de la verificación en dos pasos: se exige aquí.
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if not private.can_use_branch(p_branch) then
    raise exception 'No tienes acceso a esa sucursal.' using errcode = '42501';
  end if;
  return query
    select p.id, p.first_name, p.last_name, p.avatar_url, null::text, '{}'::uuid[], true
    from public.branches br
    join public.businesses b on b.id = br.business_id
    join public.profiles p on p.id = b.owner_id
    where br.id = p_branch
    union all
    select p.id, p.first_name, p.last_name, p.avatar_url, e.job_title, e.shift_ids, false
    from public.employees e
    join public.profiles p on p.id = e.person_id
    where e.branch_id = p_branch and e.status = 'activo'
    order by 7 desc, 2, 3;
end;
$$;
create function public.branch_team(p_branch uuid)
returns table (person_id uuid, first_name text, last_name text, avatar_url text, job_title text, shift_ids uuid[], is_owner boolean)
language sql
stable
set search_path = ''
as $$ select * from private.branch_team(p_branch) $$;
revoke execute on function private.branch_team(uuid), public.branch_team(uuid) from public, anon;
grant execute on function private.branch_team(uuid), public.branch_team(uuid) to authenticated;

-- La empleada elige sus turnos (uno o más) desde Tu cuenta; la dueña recibe el aviso.
drop function public.change_my_shift(uuid, uuid);
drop function private.change_my_shift(uuid, uuid);
create function private.change_my_shifts(p_employee uuid, p_shifts uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emp public.employees;
  v_owner uuid;
  v_from text;
  v_to text;
begin
  -- Security definer salta RLS, y con ella la política de la verificación en dos pasos: se exige aquí.
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;

  select * into v_emp from public.employees e
  where e.id = p_employee and e.person_id = (select auth.uid()) and e.status = 'activo'
  for update;
  if v_emp.id is null then
    raise exception 'No encontramos tu ficha en ese negocio.' using errcode = '42501';
  end if;

  p_shifts := array(select distinct unnest(p_shifts));
  if cardinality(p_shifts) = 0 then
    raise exception 'Elige al menos un turno.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(p_shifts) as x(id)
    where not exists (select 1 from public.shifts s where s.id = x.id and s.branch_id = v_emp.branch_id and s.archived_at is null)
  ) then
    raise exception 'Ese turno no es de tu sucursal o ya no existe.' using errcode = 'P0001';
  end if;
  if v_emp.shift_ids @> p_shifts and p_shifts @> v_emp.shift_ids then
    return;
  end if;

  select string_agg(s.name, ', ' order by s.start_time) into v_from from public.shifts s where s.id = any (v_emp.shift_ids);
  select string_agg(s.name, ', ' order by s.start_time) into v_to from public.shifts s where s.id = any (p_shifts);
  update public.employees set shift_ids = p_shifts where id = v_emp.id;

  select b.owner_id into v_owner from public.businesses b where b.id = v_emp.business_id;
  perform private.notify(v_owner, 'shift_change', v_emp.business_id, v_emp.id, jsonb_build_object(
    'person', private.full_name(v_emp.person_id),
    'business', (select b.name from public.businesses b where b.id = v_emp.business_id),
    'branch', (select br.name from public.branches br where br.id = v_emp.branch_id),
    'from', v_from,
    'to', v_to
  ));
end;
$$;
create function public.change_my_shifts(p_employee uuid, p_shifts uuid[])
returns void
language sql
set search_path = ''
as $$ select private.change_my_shifts(p_employee, p_shifts) $$;
revoke execute on function private.change_my_shifts(uuid, uuid[]), public.change_my_shifts(uuid, uuid[]) from public, anon;
grant execute on function private.change_my_shifts(uuid, uuid[]), public.change_my_shifts(uuid, uuid[]) to authenticated;

-- Abrir: solo quien tiene ese turno entre los suyos.
create or replace function private.check_shift_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start time;
  v_end time;
  v_name text;
begin
  select s.start_time, s.end_time, s.name into v_start, v_end, v_name from public.shifts s where s.id = new.shift_id;
  if not exists (
    select 1 from public.employees e
    where e.person_id = (select auth.uid())
      and e.branch_id = new.branch_id
      and e.shift_ids @> array[new.shift_id]
      and e.status = 'activo'
  ) then
    raise exception 'Solo puedes abrir tu propio turno. El turno % lo abre quien trabaja en él.', lower(v_name)
      using errcode = 'P0001';
  end if;
  if not private.in_shift_window(v_start, v_end, (now() at time zone 'America/La_Paz')::time) then
    raise exception 'El turno % se abre de % a %.',
      lower(v_name), to_char(v_start - interval '15 minutes', 'HH24:MI'), to_char(v_end, 'HH24:MI')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- La invitación nombra todos sus turnos.
create or replace function private.notify_invitation(e public.employees)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.notify(e.person_id, 'invitation', e.business_id, e.id, jsonb_build_object(
    'business', (select b.name from public.businesses b where b.id = e.business_id),
    'owner', (select private.full_name(b.owner_id) from public.businesses b where b.id = e.business_id),
    'branch', (select br.name from public.branches br where br.id = e.branch_id),
    'shift', (select string_agg(s.name, ', ' order by s.start_time) from public.shifts s where s.id = any (e.shift_ids)),
    'jobTitle', e.job_title
  ))
$$;

create or replace function private.request_reopen(p_close uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_close public.shift_closes;
  v_shift public.shifts;
  v_owner uuid;
  v_business uuid;
  v_request uuid;
  v_data jsonb;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_close from public.shift_closes c where c.id = p_close;
  if v_close.id is null or not private.can_use_branch(v_close.branch_id) then
    raise exception 'No tienes acceso a esa sucursal.' using errcode = '42501';
  end if;
  if private.owns_branch(v_close.branch_id) then
    raise exception 'Como administras el negocio, puedes reabrirlo tú directamente.' using errcode = 'P0001';
  end if;
  if not (v_close.opened_by = v_me or v_close.closed_by = v_me or exists (
    select 1 from public.employees e
    where e.person_id = v_me and e.branch_id = v_close.branch_id and e.shift_ids @> array[v_close.shift_id] and e.status = 'activo'
  )) then
    raise exception 'Solo quien trabaja en ese turno puede pedir que se reabra.' using errcode = '42501';
  end if;
  if v_close.status <> 'cerrado' then
    raise exception 'Ese turno ya está abierto.' using errcode = 'P0001';
  end if;
  if v_close.business_date < private.today() - 1
     or exists (select 1 from public.shift_closes c where c.shift_id = v_close.shift_id and c.business_date > v_close.business_date) then
    raise exception 'Solo se puede reabrir el último cierre de un turno, de hoy o de ayer.' using errcode = 'P0001';
  end if;
  select * into v_shift from public.shifts s where s.id = v_close.shift_id;
  if not private.in_shift_window(v_shift.start_time, v_shift.end_time, (now() at time zone 'America/La_Paz')::time) then
    raise exception 'El turno % se reabre solo dentro de su horario, de % a %.',
      lower(v_shift.name), to_char(v_shift.start_time - interval '15 minutes', 'HH24:MI'), to_char(v_shift.end_time, 'HH24:MI')
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reopen_requests r where r.close_id = p_close and r.status = 'pendiente') then
    raise exception 'Ya pediste reabrir este turno. Espera la respuesta de quien administra el negocio.' using errcode = 'P0001';
  end if;

  insert into public.reopen_requests (close_id, branch_id, requested_by, reason)
  values (p_close, v_close.branch_id, v_me, nullif(btrim(p_reason), ''))
  returning id into v_request;

  select b.id, b.owner_id into v_business, v_owner
  from public.branches br join public.businesses b on b.id = br.business_id where br.id = v_close.branch_id;
  v_data := jsonb_build_object(
    'person', private.full_name(v_me),
    'owner', private.full_name(v_owner),
    'branch', (select br.name from public.branches br where br.id = v_close.branch_id),
    'shift', v_shift.name,
    'date', v_close.business_date,
    'reason', nullif(btrim(p_reason), '')
  );
  insert into public.notifications (user_id, kind, business_id, reopen_request_id, data)
  values (v_owner, 'reopen_request', v_business, v_request, v_data),
         (v_me, 'reopen_sent', v_business, v_request, v_data);
  return v_request;
end;
$$;

create or replace function private.shift_reminders()
returns void
language plpgsql
security definer
set search_path = ''
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
      if exists (select 1 from public.employees e where e.shift_ids @> array[r.id] and e.status = 'activo' and e.person_id is not null) then
        perform private.notify(e.person_id, 'shift_reminder', r.business_id, e.id, v_data)
        from public.employees e where e.shift_ids @> array[r.id] and e.status = 'activo' and e.person_id is not null;
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
