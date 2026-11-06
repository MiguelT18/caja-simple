-- Pedir que se reabra un turno cerrado. Quien trabaja en la sucursal no reabre por su cuenta (solo la dueña, con
-- public.reopen_shift): lo pide, la dueña recibe un aviso con «Aceptar» y «Rechazar», y quien pidió recibe la respuesta.

alter type public.notification_kind add value if not exists 'reopen_request';
alter type public.notification_kind add value if not exists 'reopen_answer';

create type public.reopen_status as enum ('pendiente', 'aceptada', 'rechazada');

create table public.reopen_requests (
  id uuid primary key default gen_random_uuid(),
  close_id uuid not null references public.shift_closes (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  requested_by uuid default auth.uid() references public.profiles (id) on delete set null,
  reason text check (char_length(reason) <= 200),
  status public.reopen_status not null default 'pendiente',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- Un solo pedido esperando por cierre.
create unique index reopen_requests_one_pending_idx on public.reopen_requests (close_id) where status = 'pendiente';
create index reopen_requests_branch_idx on public.reopen_requests (branch_id, created_at desc);
create index reopen_requests_requested_by_idx on public.reopen_requests (requested_by);
create index reopen_requests_decided_by_idx on public.reopen_requests (decided_by);

alter table public.reopen_requests enable row level security;
create policy "Ver tus pedidos y los de tus sucursales" on public.reopen_requests for select to authenticated
  using (requested_by = (select auth.uid()) or (select private.owns_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.reopen_requests as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Se escribe solo con las funciones de abajo.
revoke all on public.reopen_requests from anon, authenticated;
grant select on public.reopen_requests to authenticated;

-- El aviso de la dueña sabe de qué pedido es: así muestra si sigue esperando respuesta.
alter table public.notifications
  add column reopen_request_id uuid references public.reopen_requests (id) on delete cascade;
create index notifications_reopen_request_idx on public.notifications (reopen_request_id);

-- Pedir: quien está asignado a ese turno, o quien lo abrió o lo cerró. Las mismas reglas que reopen_shift: el último
-- cierre del turno, de hoy o de ayer, sin otra apertura en curso.
create function private.request_reopen(p_close uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_close public.shift_closes;
  v_owner uuid;
  v_business uuid;
  v_request uuid;
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
    where e.person_id = v_me and e.branch_id = v_close.branch_id and e.shift_id = v_close.shift_id and e.status = 'activo'
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
  if exists (select 1 from public.reopen_requests r where r.close_id = p_close and r.status = 'pendiente') then
    raise exception 'Ya pediste reabrir este turno. Espera la respuesta de quien administra el negocio.' using errcode = 'P0001';
  end if;

  insert into public.reopen_requests (close_id, branch_id, requested_by, reason)
  values (p_close, v_close.branch_id, v_me, nullif(btrim(p_reason), ''))
  returning id into v_request;

  select b.id, b.owner_id into v_business, v_owner
  from public.branches br join public.businesses b on b.id = br.business_id where br.id = v_close.branch_id;
  insert into public.notifications (user_id, kind, business_id, reopen_request_id, data)
  values (v_owner, 'reopen_request', v_business, v_request, jsonb_build_object(
    'person', private.full_name(v_me),
    'branch', (select br.name from public.branches br where br.id = v_close.branch_id),
    'shift', (select s.name from public.shifts s where s.id = v_close.shift_id),
    'date', v_close.business_date,
    'reason', nullif(btrim(p_reason), '')
  ));
  return v_request;
end;
$$;

-- Responder: solo la dueña. Al aceptar, reabre con las reglas de siempre (private.reopen_shift); si ya no se
-- puede (otra apertura, pasó el día), la respuesta falla con ese motivo y la dueña puede rechazarlo.
create function private.answer_reopen(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.reopen_requests;
  v_close public.shift_closes;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_request from public.reopen_requests r where r.id = p_request for update;
  if v_request.id is null or not private.owns_branch(v_request.branch_id) then
    raise exception 'Solo quien administra el negocio responde estos pedidos.' using errcode = '42501';
  end if;
  if v_request.status <> 'pendiente' then
    raise exception 'Ese pedido ya se respondió.' using errcode = 'P0001';
  end if;
  if p_accept then
    perform private.reopen_shift(v_request.close_id);
  end if;

  update public.reopen_requests
  set status = case when p_accept then 'aceptada'::public.reopen_status else 'rechazada' end,
      decided_by = (select auth.uid()), decided_at = now()
  where id = p_request;
  update public.notifications set read_at = coalesce(read_at, now())
  where reopen_request_id = p_request and user_id = (select auth.uid());

  if v_request.requested_by is not null then
    select * into v_close from public.shift_closes c where c.id = v_request.close_id;
    perform private.notify(v_request.requested_by, 'reopen_answer',
      (select br.business_id from public.branches br where br.id = v_request.branch_id), null,
      jsonb_build_object(
        'accepted', p_accept,
        'person', private.full_name((select auth.uid())),
        'branch', (select br.name from public.branches br where br.id = v_request.branch_id),
        'shift', (select s.name from public.shifts s where s.id = v_close.shift_id),
        'date', v_close.business_date
      ));
  end if;
end;
$$;

create function public.request_reopen(p_close uuid, p_reason text default null) returns uuid
language sql security invoker set search_path = ''
as $$ select private.request_reopen(p_close, p_reason) $$;

create function public.answer_reopen(p_request uuid, p_accept boolean) returns void
language sql security invoker set search_path = ''
as $$ select private.answer_reopen(p_request, p_accept) $$;

revoke execute on function private.request_reopen(uuid, text), private.answer_reopen(uuid, boolean) from public, anon;
grant execute on function private.request_reopen(uuid, text), private.answer_reopen(uuid, boolean) to authenticated;
revoke execute on function public.request_reopen(uuid, text), public.answer_reopen(uuid, boolean) from public, anon;
grant execute on function public.request_reopen(uuid, text), public.answer_reopen(uuid, boolean) to authenticated;
