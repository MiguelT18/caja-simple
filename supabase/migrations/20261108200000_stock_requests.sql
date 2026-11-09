-- Entradas de mercadería de las empleadas, con aprobación de la dueña. La empleada pide sumar stock
-- (request_stock_entry) y la dueña recibe un aviso; al aceptar (answer_stock_request) el stock sube y queda en
-- stock_movements con quién lo pidió y quién lo aceptó. Lo que registra la dueña se aplica directo (record_stock_move),
-- que desde ahora es solo suyo: nadie se salta la aprobación llamando a la función.

alter type public.notification_kind add value if not exists 'stock_request';
alter type public.notification_kind add value if not exists 'stock_answer';

-- reopen_status: pendiente / aceptada / rechazada, los mismos estados que un pedido de reapertura.
create table public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  qty integer not null check (qty between 1 and 100000),
  reason text check (char_length(reason) <= 120),
  requested_by uuid default auth.uid() references public.profiles (id) on delete set null,
  status public.reopen_status not null default 'pendiente',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index stock_requests_pending_idx on public.stock_requests (branch_id, created_at desc) where status = 'pendiente';
create index stock_requests_business_idx on public.stock_requests (business_id);
create index stock_requests_product_idx on public.stock_requests (product_id);
create index stock_requests_requested_by_idx on public.stock_requests (requested_by);
create index stock_requests_decided_by_idx on public.stock_requests (decided_by);

alter table public.stock_requests enable row level security;
create policy "Ver tus pedidos de stock y los de tus sucursales" on public.stock_requests for select to authenticated
  using (requested_by = (select auth.uid()) or (select private.owns_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.stock_requests as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Se escribe solo con las funciones de abajo.
revoke all on public.stock_requests from anon, authenticated;
grant select on public.stock_requests to authenticated;

-- Quién aceptó la entrada que pidió una empleada (recorded_by es quien la pidió).
alter table public.stock_movements add column approved_by uuid references public.profiles (id) on delete set null;
create index stock_movements_approved_by_idx on public.stock_movements (approved_by);

-- El aviso de la dueña sabe de qué pedido es: así muestra si sigue esperando respuesta.
alter table public.notifications add column stock_request_id uuid references public.stock_requests (id) on delete cascade;
create index notifications_stock_request_idx on public.notifications (stock_request_id);

-- Pedir: cualquiera de la sucursal que no sea la dueña (ella lo registra directo).
create function private.request_stock_entry(p_branch uuid, p_product uuid, p_qty integer, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_inv public.inventory;
  v_request uuid;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if not private.can_use_branch(p_branch) then
    raise exception 'No tienes acceso a esa sucursal.' using errcode = '42501';
  end if;
  if private.owns_branch(p_branch) then
    raise exception 'Como administras el negocio, registra la entrada directamente.' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 100000 then
    raise exception 'Revisa la cantidad.' using errcode = 'P0001';
  end if;
  select * into v_inv from public.inventory i where i.branch_id = p_branch and i.product_id = p_product;
  if v_inv.product_id is null then
    raise exception 'Ese producto no está en esta sucursal.' using errcode = 'P0001';
  end if;
  if v_inv.stock is null then
    raise exception 'Este producto no lleva control de stock.' using errcode = 'P0001';
  end if;
  if private.effective_plan(v_inv.business_id) = 'Gratis' then
    raise exception 'El control de stock es de los planes pagos. Tu stock sigue a la vista; para cambiarlo, pasa al plan Negocio.' using errcode = 'P0001';
  end if;

  insert into public.stock_requests (business_id, branch_id, product_id, qty, reason, requested_by)
  values (v_inv.business_id, p_branch, p_product, p_qty, nullif(btrim(p_reason), ''), v_me)
  returning id into v_request;

  insert into public.notifications (user_id, kind, business_id, stock_request_id, data)
  values ((select b.owner_id from public.businesses b where b.id = v_inv.business_id), 'stock_request', v_inv.business_id, v_request,
    jsonb_build_object(
      'person', private.full_name(v_me),
      'product', (select p.name from public.products p where p.id = p_product),
      'qty', p_qty,
      'branch', (select br.name from public.branches br where br.id = p_branch),
      'reason', nullif(btrim(p_reason), '')
    ));
  return v_request;
end;
$$;

-- Responder: solo la dueña. Al aceptar suma el stock y lo deja en el historial; si ya no se puede (el producto dejó
-- de llevar stock, se quitó de la sucursal), falla con el motivo y la dueña puede rechazarlo.
create function private.answer_stock_request(p_request uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_request public.stock_requests;
  v_inv public.inventory;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_request from public.stock_requests r where r.id = p_request for update;
  if v_request.id is null or not private.owns_branch(v_request.branch_id) then
    raise exception 'Solo quien administra el negocio responde estos pedidos.' using errcode = '42501';
  end if;
  if v_request.status <> 'pendiente' then
    raise exception 'Ese pedido ya se respondió.' using errcode = 'P0001';
  end if;

  if p_accept then
    select * into v_inv from public.inventory i
    where i.branch_id = v_request.branch_id and i.product_id = v_request.product_id for update;
    if v_inv.product_id is null then
      raise exception 'Ese producto ya no está en esta sucursal. Rechaza el pedido.' using errcode = 'P0001';
    end if;
    if v_inv.stock is null then
      raise exception 'Ese producto ya no lleva control de stock. Rechaza el pedido.' using errcode = 'P0001';
    end if;
    -- inventory_freeze_stock frena esto en Gratis, con su mensaje.
    update public.inventory set stock = stock + v_request.qty
    where branch_id = v_request.branch_id and product_id = v_request.product_id;
    insert into public.stock_movements (business_id, branch_id, product_id, kind, qty, reason, recorded_by, approved_by)
    values (v_request.business_id, v_request.branch_id, v_request.product_id, 'entrada', v_request.qty, v_request.reason,
            v_request.requested_by, (select auth.uid()));
  end if;

  update public.stock_requests
  set status = case when p_accept then 'aceptada'::public.reopen_status else 'rechazada' end,
      decided_by = (select auth.uid()), decided_at = now()
  where id = p_request;
  update public.notifications set read_at = coalesce(read_at, now())
  where stock_request_id = p_request and user_id = (select auth.uid());

  if v_request.requested_by is not null then
    perform private.notify(v_request.requested_by, 'stock_answer', v_request.business_id, null, jsonb_build_object(
      'accepted', p_accept,
      'person', private.full_name((select auth.uid())),
      'product', (select p.name from public.products p where p.id = v_request.product_id),
      'qty', v_request.qty,
      'branch', (select br.name from public.branches br where br.id = v_request.branch_id)
    ));
  end if;
end;
$$;

-- Igual que en 20261103180000_p1_closes_stock.sql, pero todo es de la dueña: la empleada pide con request_stock_entry.
create or replace function private.record_stock_move(p_branch uuid, p_product uuid, p_kind public.stock_move_kind, p_qty integer, p_reason text)
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
  if not private.owns_branch(p_branch) then
    raise exception 'Pide la entrada: quien administra el negocio la acepta y el stock sube.' using errcode = '42501';
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

create function public.request_stock_entry(p_branch uuid, p_product uuid, p_qty integer, p_reason text default null) returns uuid
language sql security invoker set search_path = ''
as $$ select private.request_stock_entry(p_branch, p_product, p_qty, p_reason) $$;

create function public.answer_stock_request(p_request uuid, p_accept boolean) returns void
language sql security invoker set search_path = ''
as $$ select private.answer_stock_request(p_request, p_accept) $$;

revoke execute on function private.request_stock_entry(uuid, uuid, integer, text), private.answer_stock_request(uuid, boolean) from public, anon;
grant execute on function private.request_stock_entry(uuid, uuid, integer, text), private.answer_stock_request(uuid, boolean) to authenticated;
revoke execute on function public.request_stock_entry(uuid, uuid, integer, text), public.answer_stock_request(uuid, boolean) from public, anon;
grant execute on function public.request_stock_entry(uuid, uuid, integer, text), public.answer_stock_request(uuid, boolean) to authenticated;
