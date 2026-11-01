-- Turnos personalizables: cada sucursal define los suyos al crearse, se pueden quitar
-- (archivar, para no perder el historial) y pueden cruzar la medianoche (fin < inicio).

alter table public.shifts
  add column archived_at timestamptz,
  add constraint shifts_hours_check check (start_time <> end_time);
create unique index shifts_name_idx on public.shifts (branch_id, lower(name)) where archived_at is null;

-- Un turno no puede quedar abierto dos veces (ayer sin cerrar y hoy).
create unique index shift_closes_one_open_idx on public.shift_closes (shift_id) where status = 'en-curso';

-- Ventas y gastos usan el cierre abierto del turno, sea de hoy o de ayer (turno nocturno):
-- el movimiento cuenta para el día en que se abrió el turno.
create or replace function private.require_open_shift() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_date date;
begin
  select c.business_date into v_date from public.shift_closes c
  where c.shift_id = new.shift_id and c.status = 'en-curso';
  if v_date is null then
    raise exception 'El turno no está abierto. Ábrelo en Turnos para registrar movimientos.' using errcode = 'P0001';
  end if;
  new.business_date := v_date;
  return new;
end;
$$;

-- El negocio nace con los turnos que elige la dueña.
drop function public.create_business(text, text, text, text, text);
create function public.create_business(
  p_name text, p_slug text, p_branch_name text, p_branch_slug text, p_branch_address text, p_shifts jsonb
) returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_business uuid;
  v_branch uuid;
begin
  if jsonb_typeof(p_shifts) <> 'array' or jsonb_array_length(p_shifts) = 0 then
    raise exception 'Agrega al menos un turno' using errcode = 'P0001';
  end if;
  insert into public.businesses (name, slug) values (btrim(p_name), p_slug) returning id into v_business;
  insert into public.branches (business_id, name, slug, address)
  values (v_business, btrim(p_branch_name), p_branch_slug, coalesce(btrim(p_branch_address), ''))
  returning id into v_branch;
  insert into public.shifts (branch_id, name, start_time, end_time, tone)
  select v_branch, btrim(s ->> 'name'), (s ->> 'start')::time, (s ->> 'end')::time, (s ->> 'tone')::public.shift_tone
  from jsonb_array_elements(p_shifts) s;
  return p_slug;
end;
$$;

revoke execute on function public.create_business(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_business(text, text, text, text, text, jsonb) to authenticated;
