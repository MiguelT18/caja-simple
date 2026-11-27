-- Avisos de cada movimiento de stock y nota al recibir.
--
-- · Entradas, mermas y ajustes que registra la dueña avisan al equipo de la sucursal (cualquiera sea su turno) y a la
--   dueña misma (stock_move). Las entradas que la sucursal tiene que confirmar ya avisan al equipo (stock_delivery):
--   ahí solo se suma el aviso a la dueña. Lo que acepta o recibe otra persona (approved_by) ya tiene su propio aviso.
-- · Quien recibe un envío puede dejar una nota («llegaron 2 cajas abolladas»): queda en el envío, en el movimiento y en
--   el aviso a quien lo envió.

alter type public.notification_kind add value if not exists 'stock_move';

alter table public.stock_deliveries add column note text check (char_length(note) <= 200);
alter table public.stock_movements add column note text check (char_length(note) <= 200);

create function private.notify_stock_move() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_owner uuid;
  v_data jsonb;
begin
  -- Sin sesión (seed, tareas de la base) no se avisa.
  if v_me is null or (tg_table_name = 'stock_movements' and new.approved_by is not null) then
    return null;
  end if;
  select b.owner_id into v_owner
  from public.branches br join public.businesses b on b.id = br.business_id
  where br.id = new.branch_id;

  v_data := jsonb_build_object(
    'person', private.full_name(v_me),
    'product', (select p.name from public.products p where p.id = new.product_id),
    'kind', case tg_table_name when 'stock_deliveries' then 'entrada' else new.kind::text end,
    -- Con signo: lo que suma o resta.
    'qty', new.qty,
    'branch', (select br.name from public.branches br where br.id = new.branch_id),
    'reason', new.reason,
    'pending', tg_table_name = 'stock_deliveries'
  );

  insert into public.notifications (user_id, kind, business_id, data)
  select r.id, 'stock_move', new.business_id, v_data || jsonb_build_object('self', r.id = v_me)
  from (
    select v_owner as id
    union
    -- El equipo ya recibe el envío por confirmar (stock_delivery).
    select e.person_id from public.employees e
    where tg_table_name = 'stock_movements'
      and e.branch_id = new.branch_id and e.status = 'activo' and e.person_id is not null and e.person_id <> v_me
  ) r
  where r.id is not null;
  return null;
end;
$$;
revoke execute on function private.notify_stock_move() from public, anon, authenticated;

create trigger stock_movements_notify after insert on public.stock_movements
  for each row execute function private.notify_stock_move();
create trigger stock_deliveries_notify after insert on public.stock_deliveries
  for each row execute function private.notify_stock_move();

-- Recibir, ahora con nota. Igual que en 20261121174054_stock_deliveries.sql salvo p_note.
drop function public.receive_stock(uuid, integer);
drop function private.receive_stock(uuid, integer);

create function private.receive_stock(p_delivery uuid, p_qty integer, p_note text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_delivery public.stock_deliveries;
  v_inv public.inventory;
  v_note text := nullif(btrim(p_note), '');
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
  if char_length(v_note) > 200 then
    raise exception 'La nota puede tener hasta 200 letras.' using errcode = 'P0001';
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
    insert into public.stock_movements (business_id, branch_id, product_id, kind, qty, reason, note, recorded_by, approved_by)
    values (v_delivery.business_id, v_delivery.branch_id, v_delivery.product_id, 'entrada', p_qty, v_delivery.reason, v_note,
            v_delivery.sent_by, (select auth.uid()));
  end if;

  update public.stock_deliveries
  set status = case when p_qty > 0 then 'aceptada'::public.reopen_status else 'rechazada' end,
      received_qty = p_qty, note = v_note, decided_by = (select auth.uid()), decided_at = now()
  where id = p_delivery;
  -- El aviso ya no espera respuesta de nadie de la sucursal.
  update public.notifications set read_at = coalesce(read_at, now()) where stock_delivery_id = p_delivery;

  if v_delivery.sent_by is not null then
    perform private.notify(v_delivery.sent_by, 'stock_received', v_delivery.business_id, null, jsonb_build_object(
      'person', private.full_name((select auth.uid())),
      'product', (select p.name from public.products p where p.id = v_delivery.product_id),
      'qty', v_delivery.qty,
      'received', p_qty,
      'branch', (select br.name from public.branches br where br.id = v_delivery.branch_id),
      'note', v_note
    ));
  end if;
end;
$$;

create function public.receive_stock(p_delivery uuid, p_qty integer, p_note text default null) returns void
language sql security invoker set search_path = ''
as $$ select private.receive_stock(p_delivery, p_qty, p_note) $$;

revoke execute on function private.receive_stock(uuid, integer, text), public.receive_stock(uuid, integer, text) from public, anon;
grant execute on function private.receive_stock(uuid, integer, text), public.receive_stock(uuid, integer, text) to authenticated;
