-- P1: cierres de turno explicados (quién cerró y una nota), reabrir un cierre por error y movimientos de stock
-- (entradas, mermas y ajustes con motivo). Ver docs/modelo-de-datos.md.

-- Cierres -------------------------------------------------------------------

alter table public.shift_closes
  add column closed_by uuid references public.profiles (id) on delete set null,
  add column note text check (char_length(note) <= 300),
  add column reopened_by uuid references public.profiles (id) on delete set null,
  add column reopened_at timestamptz;
create index shift_closes_closed_by_idx on public.shift_closes (closed_by);
create index shift_closes_reopened_by_idx on public.shift_closes (reopened_by);

-- Al cerrar se fija la hora y quién cerró. Un cierre solo vuelve a «en curso» desde public.reopen_shift.
create or replace function private.on_shift_close() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'cerrado' and new.status = 'en-curso' then
    if coalesce(current_setting('caja.reopen', true), '') <> 'on' then
      raise exception 'Un turno cerrado solo lo reabre quien administra el negocio.' using errcode = '42501';
    end if;
  elsif new.status = 'cerrado' and old.status = 'en-curso' then
    new.closed_at := now();
    new.closed_by := auth.uid();
  else
    new.closed_at := old.closed_at;
    new.closed_by := old.closed_by;
  end if;
  if coalesce(current_setting('caja.reopen', true), '') <> 'on' then
    new.reopened_by := old.reopened_by;
    new.reopened_at := old.reopened_at;
  end if;
  new.opening := old.opening;
  new.opened_by := old.opened_by;
  new.business_date := old.business_date;
  return new;
end;
$$;

-- La nota que explica un descuadre: la escribe quien cerró o la dueña, también después de cerrar.
create function private.set_close_note(p_close uuid, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Security definer salta RLS, y con ella la política de la verificación en dos pasos: se exige aquí.
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  update public.shift_closes c set note = nullif(btrim(p_note), '')
  where c.id = p_close
    and (private.owns_branch(c.branch_id) or (c.closed_by = (select auth.uid()) and private.can_use_branch(c.branch_id)));
  if not found then
    raise exception 'No puedes editar la nota de ese cierre.' using errcode = '42501';
  end if;
end;
$$;

create function public.set_close_note(p_close uuid, p_note text) returns void
language sql security invoker set search_path = ''
as $$ select private.set_close_note(p_close, p_note) $$;

-- Reabrir un turno cerrado por error: solo la dueña, y solo el último cierre de ese turno (de hoy o de ayer).
create function private.reopen_shift(p_close uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_close public.shift_closes;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_close from public.shift_closes c where c.id = p_close for update;
  if v_close.id is null or not private.owns_branch(v_close.branch_id) then
    raise exception 'Solo quien administra el negocio puede reabrir un turno.' using errcode = '42501';
  end if;
  if v_close.status <> 'cerrado' then
    raise exception 'Ese turno ya está abierto.' using errcode = 'P0001';
  end if;
  if v_close.business_date < private.today() - 1
     or exists (select 1 from public.shift_closes c where c.shift_id = v_close.shift_id and c.business_date > v_close.business_date) then
    raise exception 'Solo se puede reabrir el último cierre de un turno, de hoy o de ayer.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shift_closes c where c.shift_id = v_close.shift_id and c.status = 'en-curso') then
    raise exception 'Ese turno ya tiene otra apertura en curso.' using errcode = 'P0001';
  end if;

  perform set_config('caja.reopen', 'on', true);
  update public.shift_closes
  set status = 'en-curso', counted = null, closed_at = null, closed_by = null,
      reopened_by = (select auth.uid()), reopened_at = now()
  where id = p_close;
  perform set_config('caja.reopen', '', true);
end;
$$;

create function public.reopen_shift(p_close uuid) returns void
language sql security invoker set search_path = ''
as $$ select private.reopen_shift(p_close) $$;

-- Movimientos de stock ------------------------------------------------------

create type public.stock_move_kind as enum ('entrada', 'merma', 'ajuste');

-- Entradas de mercadería, mermas y ajustes. Las ventas descuentan stock por su cuenta (sale_items).
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  kind public.stock_move_kind not null,
  -- Con signo: lo que sumó (+) o restó (−) al stock.
  qty integer not null check (qty <> 0 and abs(qty) <= 100000),
  reason text check (char_length(reason) <= 120),
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now(),
  check (kind = 'entrada' or nullif(btrim(reason), '') is not null)
);
create index stock_movements_branch_time_idx on public.stock_movements (branch_id, occurred_at desc);
create index stock_movements_business_idx on public.stock_movements (business_id);
create index stock_movements_product_idx on public.stock_movements (product_id);
create index stock_movements_recorded_by_idx on public.stock_movements (recorded_by);

alter table public.stock_movements enable row level security;
create policy "Ver movimientos de stock de tus sucursales" on public.stock_movements for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.stock_movements as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Solo se escribe por public.record_stock_move (cambia el stock y deja el registro a la vez).
revoke all on public.stock_movements from anon, authenticated;
grant select on public.stock_movements to authenticated;

-- Una entrada la registra cualquiera de la sucursal; mermas y ajustes, solo la dueña.
-- p_qty: cuánto entra (entrada), cuánto se pierde (merma) o cuánto suma o resta (ajuste, con signo).
create function private.record_stock_move(p_branch uuid, p_product uuid, p_kind public.stock_move_kind, p_qty integer, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.inventory;
  v_delta integer;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if not private.can_use_branch(p_branch) then
    raise exception 'No tienes acceso a esa sucursal.' using errcode = '42501';
  end if;
  if p_kind <> 'entrada' and not private.owns_branch(p_branch) then
    raise exception 'Las mermas y los ajustes los registra quien administra el negocio.' using errcode = '42501';
  end if;
  if p_qty is null or p_qty = 0 or abs(p_qty) > 100000 or (p_kind <> 'ajuste' and p_qty < 0) then
    raise exception 'Revisa la cantidad.' using errcode = 'P0001';
  end if;
  if p_kind <> 'entrada' and nullif(btrim(p_reason), '') is null then
    raise exception 'Escribe el motivo.' using errcode = 'P0001';
  end if;

  select * into v_inv from public.inventory i where i.branch_id = p_branch and i.product_id = p_product for update;
  if v_inv.product_id is null then
    raise exception 'Ese producto no está en esta sucursal.' using errcode = 'P0001';
  end if;
  if v_inv.stock is null then
    raise exception 'Este producto no lleva control de stock.' using errcode = 'P0001';
  end if;

  v_delta := case p_kind when 'merma' then -p_qty else p_qty end;
  if v_inv.stock + v_delta < 0 then
    raise exception 'El stock no puede quedar negativo (hay %).', v_inv.stock using errcode = 'P0001';
  end if;

  update public.inventory set stock = stock + v_delta where branch_id = p_branch and product_id = p_product;
  insert into public.stock_movements (business_id, branch_id, product_id, kind, qty, reason)
  values (v_inv.business_id, p_branch, p_product, p_kind, v_delta, nullif(btrim(p_reason), ''));
end;
$$;

create function public.record_stock_move(p_branch uuid, p_product uuid, p_kind public.stock_move_kind, p_qty integer, p_reason text)
returns void
language sql security invoker set search_path = ''
as $$ select private.record_stock_move(p_branch, p_product, p_kind, p_qty, p_reason) $$;

revoke execute on function private.set_close_note(uuid, text), private.reopen_shift(uuid),
  private.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text) from public, anon;
grant execute on function private.set_close_note(uuid, text), private.reopen_shift(uuid),
  private.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text) to authenticated;
revoke execute on function public.set_close_note(uuid, text), public.reopen_shift(uuid),
  public.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text) from public, anon;
grant execute on function public.set_close_note(uuid, text), public.reopen_shift(uuid),
  public.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text) to authenticated;
