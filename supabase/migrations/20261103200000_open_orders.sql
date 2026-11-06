-- Pedidos abiertos: un carro con nombre (mesa 3, Juan) que la sucursal guarda y cobra después.
-- Al cobrarlo, public.charge_order registra la venta y cierra el pedido en la misma transacción.
-- Ver docs/modelo-de-datos.md › Pedidos abiertos.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  -- Mismo formato que register_sale: [{productId, qty, price?}]. El stock se descuenta recién al cobrar.
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 200),
  -- null: abierto. Lo pone solo charge_order.
  sale_id uuid unique references public.sales (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index orders_open_idx on public.orders (branch_id, created_at) where sale_id is null;
create index orders_branch_idx on public.orders (branch_id);
create index orders_created_by_idx on public.orders (created_by);

alter table public.orders enable row level security;
create policy "Ver pedidos de tus sucursales" on public.orders for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "Crear pedidos en tus sucursales" on public.orders for insert to authenticated
  with check ((select private.can_use_branch(branch_id)) and sale_id is null);
create policy "Editar pedidos abiertos" on public.orders for update to authenticated
  using ((select private.can_use_branch(branch_id)) and sale_id is null)
  with check ((select private.can_use_branch(branch_id)) and sale_id is null);
create policy "Descartar pedidos abiertos" on public.orders for delete to authenticated
  using ((select private.can_use_branch(branch_id)) and sale_id is null);
create policy "Exige la verificación en dos pasos" on public.orders as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- El cliente escribe nombre y productos; la sucursal no se mueve y el cierre es solo de charge_order.
revoke all on public.orders from anon, authenticated;
grant select, delete on public.orders to authenticated;
grant insert (id, branch_id, label, items) on public.orders to authenticated;
grant update (label, items) on public.orders to authenticated;

-- Cobra el pedido con lo que tiene el carro (p_items) y lo cierra. Reintentar con la misma venta devuelve la misma.
create function private.charge_order(p_order uuid, p_sale uuid, p_shift uuid, p_payment public.payment_method, p_items jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order for update;
  if not found or not private.can_use_branch(v_order.branch_id) then
    raise exception 'Ese pedido ya no existe.' using errcode = 'P0001';
  end if;
  if v_order.sale_id = p_sale then
    return p_sale;
  end if;
  if v_order.sale_id is not null then
    raise exception 'Ese pedido ya se cobró.' using errcode = 'P0001';
  end if;

  perform private.register_sale(p_sale, v_order.branch_id, p_shift, p_payment, p_items);
  update public.orders set sale_id = p_sale, items = p_items where id = p_order;
  return p_sale;
end;
$$;

create function public.charge_order(p_order uuid, p_sale uuid, p_shift uuid, p_payment public.payment_method, p_items jsonb)
returns uuid
language sql security invoker set search_path = ''
as $$ select private.charge_order(p_order, p_sale, p_shift, p_payment, p_items) $$;

revoke execute on function private.charge_order(uuid, uuid, uuid, public.payment_method, jsonb) from public, anon;
grant execute on function private.charge_order(uuid, uuid, uuid, public.payment_method, jsonb) to authenticated;
revoke execute on function public.charge_order(uuid, uuid, uuid, public.payment_method, jsonb) from public, anon;
grant execute on function public.charge_order(uuid, uuid, uuid, public.payment_method, jsonb) to authenticated;
