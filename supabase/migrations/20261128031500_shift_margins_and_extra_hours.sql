-- Abrir turnos con margen por empleado y horas extra.
--
-- · Cada ficha tiene su margen: abre desde open_early_min antes del inicio hasta open_late_min después del cierre
--   (30 y 30 por defecto; los cambia la dueña en Empleados).
-- · Dentro de ese margen abre sola; la dueña recibe shift_opened_early (más de 5 min antes) o shift_opened_late
--   (más de 5 min tarde).
-- · Fuera de él pide horas extra (request_extra_shift): la dueña acepta o rechaza en la campana (answer_extra_shift).
--   Aceptado, la empleada lo abre dentro de las 12 horas siguientes; el pedido queda usado (used_at, close_id).
-- · Vuelve a exigir los días hábiles al abrir (private.shift_closed_reason), que se había perdido en
--   20261121134957_owner_does_not_operate_cash.sql; las horas extra aceptadas también valen esos días.

alter type public.notification_kind add value if not exists 'shift_opened_early';
alter type public.notification_kind add value if not exists 'extra_shift_request';
alter type public.notification_kind add value if not exists 'extra_shift_answer';

alter table public.employees
  add column open_early_min smallint not null default 30 check (open_early_min between 0 and 240),
  add column open_late_min smallint not null default 30 check (open_late_min between 0 and 240);
comment on column public.employees.open_early_min is 'Minutos antes del inicio desde los que abre sus turnos.';
comment on column public.employees.open_late_min is 'Minutos después del cierre hasta los que todavía abre sus turnos.';
grant update (open_early_min, open_late_min) on public.employees to authenticated;

-- La ventana con márgenes, dando la vuelta a la medianoche. La de 3 argumentos (15 antes, hasta el cierre) sigue para reabrir.
create function private.in_shift_window(p_start time, p_end time, p_now time, p_early int, p_late int) returns boolean
language sql immutable set search_path = ''
as $$
  select mod((extract(epoch from p_now)::int / 60 - (extract(epoch from p_start)::int / 60 - p_early)) + 2880, 1440)
       < least(mod(extract(epoch from p_end)::int / 60 - extract(epoch from p_start)::int / 60 + 1440, 1440) + p_early + p_late, 1440)
$$;

create table public.extra_shift_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  requested_by uuid default auth.uid() references public.profiles (id) on delete set null,
  reason text check (char_length(reason) <= 200),
  status public.reopen_status not null default 'pendiente',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  -- La apertura que lo usó (se marca antes de insertarla: por eso la FK se revisa al final de la transacción).
  close_id uuid references public.shift_closes (id) on delete set null deferrable initially deferred,
  -- Cuándo se usó: aunque se borre esa apertura, el pedido no vuelve a servir.
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index extra_shift_requests_one_pending_idx on public.extra_shift_requests (shift_id, requested_by) where status = 'pendiente';
create index extra_shift_requests_branch_idx on public.extra_shift_requests (branch_id, created_at desc);
create index extra_shift_requests_shift_idx on public.extra_shift_requests (shift_id);
create index extra_shift_requests_requested_by_idx on public.extra_shift_requests (requested_by);
create index extra_shift_requests_decided_by_idx on public.extra_shift_requests (decided_by);
create index extra_shift_requests_close_idx on public.extra_shift_requests (close_id);
alter table public.extra_shift_requests enable row level security;
create policy "Ver tus pedidos y los de tus sucursales" on public.extra_shift_requests for select to authenticated
  using (requested_by = (select auth.uid()) or (select private.owns_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.extra_shift_requests as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Se escribe solo con las funciones de abajo.
revoke all on public.extra_shift_requests from anon, authenticated;
grant select on public.extra_shift_requests to authenticated;

alter table public.notifications
  add column extra_request_id uuid references public.extra_shift_requests (id) on delete cascade;
create index notifications_extra_request_idx on public.notifications (extra_request_id);

-- Pedir: quien tiene ese turno entre los suyos, fuera de su margen, sin apertura en curso ni cierre hoy.
create function private.request_extra_shift(p_shift uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_shift public.shifts;
  v_emp public.employees;
  v_owner uuid;
  v_business uuid;
  v_request uuid;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_shift from public.shifts s where s.id = p_shift and s.archived_at is null;
  select * into v_emp from public.employees e
  where e.person_id = v_me and e.branch_id = v_shift.branch_id and e.shift_ids @> array[p_shift] and e.status = 'activo';
  if v_shift.id is null or v_emp.id is null then
    raise exception 'Solo puedes pedir horas extra en tus propios turnos.' using errcode = '42501';
  end if;
  if private.in_shift_window(v_shift.start_time, v_shift.end_time, (now() at time zone 'America/La_Paz')::time,
                             v_emp.open_early_min, v_emp.open_late_min)
     and private.shift_closed_reason(p_shift, private.shift_date(p_shift)) is null then
    raise exception 'El turno % está en tu horario: ábrelo directamente.', lower(v_shift.name) using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shift_closes c where c.branch_id = v_shift.branch_id and c.status = 'en-curso') then
    raise exception 'Ya hay un turno abierto en esta sucursal. Ciérralo antes de pedir otro.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shift_closes c where c.shift_id = p_shift and c.business_date = private.shift_date(p_shift)) then
    raise exception 'El turno % ya se abrió hoy. Pide reabrirlo.', lower(v_shift.name) using errcode = 'P0001';
  end if;
  if exists (select 1 from public.extra_shift_requests r where r.shift_id = p_shift and r.requested_by = v_me and r.status = 'pendiente') then
    raise exception 'Ya pediste abrir este turno. Espera la respuesta de quien administra el negocio.' using errcode = 'P0001';
  end if;

  insert into public.extra_shift_requests (shift_id, branch_id, requested_by, reason)
  values (p_shift, v_shift.branch_id, v_me, nullif(btrim(p_reason), ''))
  returning id into v_request;

  select b.id, b.owner_id into v_business, v_owner
  from public.branches br join public.businesses b on b.id = br.business_id where br.id = v_shift.branch_id;
  insert into public.notifications (user_id, kind, business_id, extra_request_id, data)
  values (v_owner, 'extra_shift_request', v_business, v_request, jsonb_build_object(
    'person', private.full_name(v_me),
    'branch', (select br.name from public.branches br where br.id = v_shift.branch_id),
    'shift', v_shift.name,
    'start', to_char(v_shift.start_time, 'HH24:MI'),
    'end', to_char(v_shift.end_time, 'HH24:MI'),
    'at', to_char(now() at time zone 'America/La_Paz', 'HH24:MI'),
    'reason', nullif(btrim(p_reason), '')
  ));
  return v_request;
end;
$$;

-- Responder: solo la dueña. Aceptar no abre el turno: deja que quien pidió lo abra con su conteo.
create function private.answer_extra_shift(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.extra_shift_requests;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_request from public.extra_shift_requests r where r.id = p_request for update;
  if v_request.id is null or not private.owns_branch(v_request.branch_id) then
    raise exception 'Solo quien administra el negocio responde estos pedidos.' using errcode = '42501';
  end if;
  if v_request.status <> 'pendiente' then
    raise exception 'Ese pedido ya se respondió.' using errcode = 'P0001';
  end if;

  update public.extra_shift_requests
  set status = case when p_accept then 'aceptada'::public.reopen_status else 'rechazada' end,
      decided_by = (select auth.uid()), decided_at = now()
  where id = p_request;
  update public.notifications set read_at = coalesce(read_at, now())
  where extra_request_id = p_request and user_id = (select auth.uid());

  if v_request.requested_by is not null then
    perform private.notify(v_request.requested_by, 'extra_shift_answer',
      (select br.business_id from public.branches br where br.id = v_request.branch_id), null,
      jsonb_build_object(
        'accepted', p_accept,
        'person', private.full_name((select auth.uid())),
        'branch', (select br.name from public.branches br where br.id = v_request.branch_id),
        'shift', (select s.name from public.shifts s where s.id = v_request.shift_id)
      ));
  end if;
end;
$$;

create function public.request_extra_shift(p_shift uuid, p_reason text default null) returns uuid
language sql security invoker set search_path = ''
as $$ select private.request_extra_shift(p_shift, p_reason) $$;

create function public.answer_extra_shift(p_request uuid, p_accept boolean) returns void
language sql security invoker set search_path = ''
as $$ select private.answer_extra_shift(p_request, p_accept) $$;

revoke execute on function private.request_extra_shift(uuid, text), private.answer_extra_shift(uuid, boolean) from public, anon;
grant execute on function private.request_extra_shift(uuid, text), private.answer_extra_shift(uuid, boolean) to authenticated;
revoke execute on function public.request_extra_shift(uuid, text), public.answer_extra_shift(uuid, boolean) from public, anon;
grant execute on function public.request_extra_shift(uuid, text), public.answer_extra_shift(uuid, boolean) to authenticated;

-- Abrir: solo tu turno, dentro de tu margen y en día hábil; si no, con horas extra aceptadas (en las últimas 12 horas).
create or replace function private.check_shift_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_emp public.employees;
  v_reason text;
  v_extra uuid;
begin
  select * into v_shift from public.shifts s where s.id = new.shift_id;
  select * into v_emp from public.employees e
  where e.person_id = (select auth.uid())
    and e.branch_id = new.branch_id
    and e.shift_ids @> array[new.shift_id]
    and e.status = 'activo';
  if v_emp.id is null then
    raise exception 'Solo puedes abrir tu propio turno. El turno % lo abre quien trabaja en él.', lower(v_shift.name)
      using errcode = 'P0001';
  end if;
  v_reason := private.shift_closed_reason(new.shift_id, private.shift_date(new.shift_id));
  if private.in_shift_window(v_shift.start_time, v_shift.end_time, (now() at time zone 'America/La_Paz')::time,
                             v_emp.open_early_min, v_emp.open_late_min)
     and v_reason is null then
    return new;
  end if;

  select r.id into v_extra from public.extra_shift_requests r
  where r.shift_id = new.shift_id and r.requested_by = (select auth.uid())
    and r.status = 'aceptada' and r.used_at is null and r.decided_at > now() - interval '12 hours'
  order by r.decided_at desc limit 1
  for update;
  if v_extra is not null then
    update public.extra_shift_requests set close_id = new.id, used_at = now() where id = v_extra;
    return new;
  end if;

  if v_reason is not null then
    raise exception '%. Ese día, pide abrir el turno % como horas extra.', v_reason, lower(v_shift.name) using errcode = 'P0001';
  end if;
  raise exception 'El turno % se abre de % a %. Fuera de ese horario, pide abrirlo como horas extra.',
    lower(v_shift.name),
    to_char(v_shift.start_time - make_interval(mins => v_emp.open_early_min), 'HH24:MI'),
    to_char(v_shift.end_time + make_interval(mins => v_emp.open_late_min), 'HH24:MI')
    using errcode = 'P0001';
end;
$$;

-- Aviso a la dueña: abierto antes o tarde (más de 5 min respecto al inicio). Con horas extra no avisa: ya lo aceptó.
create or replace function private.notify_opened_late() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_now time := (now() at time zone 'America/La_Paz')::time;
  v_shift public.shifts;
  v_branch public.branches;
  v_owner uuid;
  v_diff int;
begin
  if exists (select 1 from public.extra_shift_requests r where r.close_id = new.id) then
    return null;
  end if;
  select * into v_shift from public.shifts s where s.id = new.shift_id;
  select * into v_branch from public.branches br where br.id = new.branch_id;
  select b.owner_id into v_owner from public.businesses b where b.id = v_branch.business_id;
  if new.opened_by is not distinct from v_owner then
    return null;
  end if;
  -- Minutos respecto al inicio, de −720 a 719 (dando la vuelta a la medianoche): negativo = antes.
  v_diff := mod((extract(epoch from v_now)::int / 60 - extract(epoch from v_shift.start_time)::int / 60) + 2880 + 720, 1440) - 720;
  if abs(v_diff) > 5 then
    perform private.notify(v_owner, case when v_diff > 0 then 'shift_opened_late' else 'shift_opened_early' end::public.notification_kind,
      v_branch.business_id, null, jsonb_build_object(
        'branch', v_branch.name, 'shift', v_shift.name, 'start', to_char(v_shift.start_time, 'HH24:MI'),
        'opened', to_char(v_now, 'HH24:MI'), 'minutes', abs(v_diff), 'person', private.full_name(new.opened_by)
      ));
  end if;
  return null;
end;
$$;
