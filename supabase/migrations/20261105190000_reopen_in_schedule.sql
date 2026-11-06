-- Pedir reabrir un turno (20261105180000_reopen_requests.sql), con dos cambios:
-- 1. Solo dentro de su horario (desde 15 min antes de empezar hasta el cierre), como al abrirlo
--    (private.check_shift_schedule). La dueña sigue pudiendo reabrir a cualquier hora con public.reopen_shift.
-- 2. Quien pide recibe también un aviso en su bandeja («Pediste reabrir…»), ligado al pedido para mostrar si sigue
--    esperando. La dueña ya recibía el suyo (reopen_request).

alter type public.notification_kind add value if not exists 'reopen_sent';

create or replace function private.request_reopen(p_close uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
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
