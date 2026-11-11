-- Orden de los turnos de una sucursal: el que elige la dueña al crearla (arrastrando en el editor), no la hora de
-- inicio. Los de antes quedan ordenados por hora, como se veían; un turno nuevo sin posición va al final.

alter table public.shifts add column position smallint;

update public.shifts s
set position = r.n
from (select id, (row_number() over (partition by branch_id order by start_time, created_at) - 1)::smallint as n from public.shifts) r
where r.id = s.id;

-- Sin posición (el default -1, como «Agregar turno» en Turnos), el trigger la pone al final.
alter table public.shifts alter column position set default -1, alter column position set not null;

create function private.shift_next_position() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.position < 0 then
    select coalesce(max(position) + 1, 0) into new.position from public.shifts where branch_id = new.branch_id;
  end if;
  return new;
end;
$$;

create trigger shifts_next_position before insert on public.shifts
  for each row execute function private.shift_next_position();

create index shifts_branch_position_idx on public.shifts (branch_id, position);

-- Igual que en 20261106130000_business_directory.sql, pero los turnos guardan el orden en que llegan.
create or replace function public.create_business(
  p_name text, p_slug text, p_branch_name text, p_branch_slug text, p_branch_address text, p_shifts jsonb,
  p_kind public.business_kind default 'tienda', p_description text default null, p_listed boolean default false
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
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Escribe una descripción del negocio.' using errcode = 'P0001';
  end if;
  insert into public.businesses (name, slug, kind, description, listed)
  values (btrim(p_name), p_slug, p_kind, btrim(p_description), coalesce(p_listed, false)) returning id into v_business;
  insert into public.branches (business_id, name, slug, address)
  values (v_business, btrim(p_branch_name), p_branch_slug, coalesce(btrim(p_branch_address), ''))
  returning id into v_branch;
  insert into public.shifts (branch_id, name, start_time, end_time, tone, position)
  select v_branch, btrim(t.s ->> 'name'), (t.s ->> 'start')::time, (t.s ->> 'end')::time, (t.s ->> 'tone')::public.shift_tone, (t.o - 1)::smallint
  from jsonb_array_elements(p_shifts) with ordinality as t(s, o);

  if p_kind = 'ropa' then
    with types as (
      insert into public.products (business_id, name)
      select v_business, t from unnest(array['Prenda', 'Polera', 'Pantalón', 'Chamarra']) t
      returning id
    )
    insert into public.inventory (business_id, branch_id, product_id, price, stock, min_stock)
    select v_business, v_branch, id, null, null, null from types;
  end if;
  return p_slug;
end;
$$;
