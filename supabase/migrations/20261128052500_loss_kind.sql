-- Mermas con tipo: perdido, roto, defectuoso, vencido u otro, además del motivo. El historial de Inventario lo
-- muestra y se filtra por él. Las mermas de antes quedan como «otro».

create type public.loss_kind as enum ('perdido', 'roto', 'defectuoso', 'vencido', 'otro');

alter table public.stock_movements add column loss_kind public.loss_kind;
update public.stock_movements set loss_kind = 'otro' where kind = 'merma';
alter table public.stock_movements add constraint stock_movements_loss_kind_check check ((kind = 'merma') = (loss_kind is not null));

-- Un parámetro más (p_loss_kind, obligatorio en mermas). Se reemplazan las dos versiones de 5 argumentos.
drop function public.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text);
drop function private.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text);

-- Igual que en 20261121174054_stock_deliveries.sql, con el tipo de merma.
create function private.record_stock_move(p_branch uuid, p_product uuid, p_kind public.stock_move_kind, p_qty integer, p_reason text,
                                          p_loss_kind public.loss_kind default null)
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
  if p_kind = 'merma' and p_loss_kind is null then
    raise exception 'Elige qué pasó: perdido, roto, defectuoso, vencido u otro.' using errcode = 'P0001';
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
  insert into public.stock_movements (business_id, branch_id, product_id, kind, qty, reason, loss_kind)
  values (v_inv.business_id, p_branch, p_product, p_kind, v_delta, nullif(btrim(p_reason), ''),
          case when p_kind = 'merma' then p_loss_kind end);
end;
$$;

create function public.record_stock_move(p_branch uuid, p_product uuid, p_kind public.stock_move_kind, p_qty integer, p_reason text,
                                         p_loss_kind public.loss_kind default null)
returns void
language sql security invoker set search_path = ''
as $$ select private.record_stock_move(p_branch, p_product, p_kind, p_qty, p_reason, p_loss_kind) $$;

revoke execute on function private.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text, public.loss_kind) from public, anon;
grant execute on function private.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text, public.loss_kind) to authenticated;
revoke execute on function public.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text, public.loss_kind) from public, anon;
grant execute on function public.record_stock_move(uuid, uuid, public.stock_move_kind, integer, text, public.loss_kind) to authenticated;

-- El aviso de un movimiento nombra el tipo de merma. to_jsonb: el mismo trigger corre en stock_deliveries, que no tiene la columna.
create or replace function private.notify_stock_move() returns trigger
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
    'loss', to_jsonb(new) ->> 'loss_kind',
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
