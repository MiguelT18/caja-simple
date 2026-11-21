-- El stock que entra a una sucursal lo confirma quien trabaja ahí. Lo que la dueña suma (stock inicial de un producto
-- nuevo, agregarlo a una sucursal, importar, activar el control de stock o una entrada) queda «por recibir»: una
-- empleada de la sucursal confirma cuánto le llegó (de 0 a lo enviado) y recién eso cuenta. Es directo si quien lo carga
-- trabaja en la sucursal o si ahí no trabaja nadie más. Mermas y ajustes (conteos) siguen directos.
-- Es el espejo de 20261108200000_stock_requests.sql (la empleada pide, la dueña acepta).

alter type public.notification_kind add value if not exists 'stock_delivery';
alter type public.notification_kind add value if not exists 'stock_received';

create table public.stock_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  qty integer not null check (qty between 1 and 100000),
  received_qty integer check (received_qty between 0 and qty),
  reason text check (char_length(reason) <= 120),
  sent_by uuid default auth.uid() references public.profiles (id) on delete set null,
  status public.reopen_status not null default 'pendiente',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index stock_deliveries_pending_idx on public.stock_deliveries (branch_id, created_at) where status = 'pendiente';
create index stock_deliveries_business_idx on public.stock_deliveries (business_id);
create index stock_deliveries_product_idx on public.stock_deliveries (product_id);
create index stock_deliveries_sent_by_idx on public.stock_deliveries (sent_by);
create index stock_deliveries_decided_by_idx on public.stock_deliveries (decided_by);

alter table public.stock_deliveries enable row level security;
create policy "Ver los envíos de stock de tus sucursales" on public.stock_deliveries for select to authenticated
  using ((select private.owns_branch(branch_id)) or (select private.works_in_branch(branch_id)));
create policy "Exige la verificación en dos pasos" on public.stock_deliveries as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
-- Se escribe solo con las funciones de abajo.
revoke all on public.stock_deliveries from anon, authenticated;
grant select on public.stock_deliveries to authenticated;

-- El aviso sabe de qué envío es: así muestra si sigue esperando confirmación.
alter table public.notifications add column stock_delivery_id uuid references public.stock_deliveries (id) on delete cascade;
create index notifications_stock_delivery_idx on public.notifications (stock_delivery_id);

-- Hace falta confirmar: quien carga no trabaja en la sucursal y ahí trabaja alguien más.
create function private.needs_receipt(p_branch uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not private.works_in_branch(p_branch) and exists (
    select 1 from public.employees e
    where e.branch_id = p_branch and e.status = 'activo' and e.person_id is not null and e.person_id <> (select auth.uid())
  )
$$;

-- Envía stock a la sucursal: queda pendiente y cada persona que trabaja ahí recibe el aviso.
create function private.hold_stock(p_branch uuid, p_product uuid, p_qty integer, p_reason text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_business uuid;
  v_delivery uuid;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if not private.owns_branch(p_branch) then
    raise exception 'Solo quien administra el negocio envía stock a una sucursal.' using errcode = '42501';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 100000 then
    raise exception 'Revisa la cantidad.' using errcode = 'P0001';
  end if;
  select br.business_id into v_business from public.branches br where br.id = p_branch;

  insert into public.stock_deliveries (business_id, branch_id, product_id, qty, reason, sent_by)
  values (v_business, p_branch, p_product, p_qty, nullif(btrim(p_reason), ''), v_me)
  returning id into v_delivery;

  insert into public.notifications (user_id, kind, business_id, stock_delivery_id, data)
  select e.person_id, 'stock_delivery', v_business, v_delivery, jsonb_build_object(
    'person', private.full_name(v_me),
    'product', (select p.name from public.products p where p.id = p_product),
    'qty', p_qty,
    'branch', (select br.name from public.branches br where br.id = p_branch),
    'reason', nullif(btrim(p_reason), '')
  )
  from public.employees e
  where e.branch_id = p_branch and e.status = 'activo' and e.person_id is not null and e.person_id <> v_me;
  return v_delivery;
end;
$$;

-- Lo que la dueña escribe directo en el inventario (crear producto, agregar a una sucursal, importar, activar el control
-- de stock) pasa por aquí. Invoker a propósito: current_user es «authenticated» solo en una escritura de la API; dentro
-- de las funciones security definer (ventas, anulaciones, record_stock_move, receive_stock) y en el seed no actúa.
create function private.hold_inventory_stock() returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  v_before integer := case when tg_op = 'UPDATE' then coalesce(old.stock, 0) else 0 end;
begin
  if current_user <> 'authenticated' or new.stock is null or new.stock <= v_before then
    return new;
  end if;
  if not private.needs_receipt(new.branch_id) then
    return new;
  end if;
  perform private.hold_stock(new.branch_id, new.product_id, new.stock - v_before, null);
  new.stock := v_before;
  return new;
end;
$$;
create trigger inventory_hold_stock before insert or update of stock on public.inventory
  for each row execute function private.hold_inventory_stock();

-- Igual que en 20261108200000_stock_requests.sql, pero una entrada a una sucursal donde trabaja otra persona va como
-- envío (send_stock): nadie se salta la confirmación llamando a esta función.
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
  if p_kind = 'entrada' and private.needs_receipt(p_branch) then
    raise exception 'Esta entrada la confirma la sucursal: envíala y sube cuando la reciban.' using errcode = 'P0001';
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

-- Entrada de la dueña: si la sucursal la tiene que confirmar, queda por recibir (true); si no, sube ya (false).
create function private.send_stock(p_branch uuid, p_product uuid, p_qty integer, p_reason text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.inventory;
begin
  if not private.needs_receipt(p_branch) then
    perform private.record_stock_move(p_branch, p_product, 'entrada', p_qty, p_reason);
    return false;
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
  perform private.hold_stock(p_branch, p_product, p_qty, p_reason);
  return true;
end;
$$;

-- Recibir: alguien que trabaja en la sucursal (y no lo envió) dice cuánto llegó. 0 = no llegó.
create function private.receive_stock(p_delivery uuid, p_qty integer) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_delivery public.stock_deliveries;
  v_inv public.inventory;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_delivery from public.stock_deliveries d where d.id = p_delivery for update;
  if v_delivery.id is null or not private.works_in_branch(v_delivery.branch_id) then
    raise exception 'Lo confirma quien trabaja en esa sucursal.' using errcode = '42501';
  end if;
  if v_delivery.sent_by = (select auth.uid()) then
    raise exception 'Lo que enviaste lo confirma otra persona de la sucursal.' using errcode = '42501';
  end if;
  if v_delivery.status <> 'pendiente' then
    raise exception 'Ese envío ya se confirmó.' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty < 0 or p_qty > v_delivery.qty then
    raise exception 'Escribe cuánto llegó, de 0 a %.', v_delivery.qty using errcode = 'P0001';
  end if;

  if p_qty > 0 then
    select * into v_inv from public.inventory i
    where i.branch_id = v_delivery.branch_id and i.product_id = v_delivery.product_id for update;
    if v_inv.product_id is null then
      raise exception 'Ese producto ya no está en esta sucursal. Confirma 0 para cerrarlo.' using errcode = 'P0001';
    end if;
    if v_inv.stock is null then
      raise exception 'Ese producto ya no lleva control de stock. Confirma 0 para cerrarlo.' using errcode = 'P0001';
    end if;
    -- inventory_freeze_stock frena esto en Gratis, con su mensaje.
    update public.inventory set stock = stock + p_qty
    where branch_id = v_delivery.branch_id and product_id = v_delivery.product_id;
    insert into public.stock_movements (business_id, branch_id, product_id, kind, qty, reason, recorded_by, approved_by)
    values (v_delivery.business_id, v_delivery.branch_id, v_delivery.product_id, 'entrada', p_qty, v_delivery.reason,
            v_delivery.sent_by, (select auth.uid()));
  end if;

  update public.stock_deliveries
  set status = case when p_qty > 0 then 'aceptada'::public.reopen_status else 'rechazada' end,
      received_qty = p_qty, decided_by = (select auth.uid()), decided_at = now()
  where id = p_delivery;
  -- El aviso ya no espera respuesta de nadie de la sucursal.
  update public.notifications set read_at = coalesce(read_at, now()) where stock_delivery_id = p_delivery;

  if v_delivery.sent_by is not null then
    perform private.notify(v_delivery.sent_by, 'stock_received', v_delivery.business_id, null, jsonb_build_object(
      'person', private.full_name((select auth.uid())),
      'product', (select p.name from public.products p where p.id = v_delivery.product_id),
      'qty', v_delivery.qty,
      'received', p_qty,
      'branch', (select br.name from public.branches br where br.id = v_delivery.branch_id)
    ));
  end if;
end;
$$;

create function public.send_stock(p_branch uuid, p_product uuid, p_qty integer, p_reason text default null) returns boolean
language sql security invoker set search_path = ''
as $$ select private.send_stock(p_branch, p_product, p_qty, p_reason) $$;

create function public.receive_stock(p_delivery uuid, p_qty integer) returns void
language sql security invoker set search_path = ''
as $$ select private.receive_stock(p_delivery, p_qty) $$;

revoke execute on function private.needs_receipt(uuid), private.hold_stock(uuid, uuid, integer, text), private.hold_inventory_stock(),
  private.send_stock(uuid, uuid, integer, text), private.receive_stock(uuid, integer) from public, anon;
-- needs_receipt y hold_stock: los llama el trigger (invoker) en nombre de quien escribe el inventario.
grant execute on function private.needs_receipt(uuid), private.hold_stock(uuid, uuid, integer, text),
  private.send_stock(uuid, uuid, integer, text), private.receive_stock(uuid, integer) to authenticated;
revoke execute on function public.send_stock(uuid, uuid, integer, text), public.receive_stock(uuid, integer) from public, anon;
grant execute on function public.send_stock(uuid, uuid, integer, text), public.receive_stock(uuid, integer) to authenticated;
