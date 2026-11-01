-- Un negocio no se queda sin sucursales: la última solo se va al eliminar el negocio entero.
-- Al borrar el negocio, la cascada llega aquí con la fila del negocio ya borrada, y se deja pasar.
create function private.keep_one_branch() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.businesses b where b.id = old.business_id)
    and not exists (select 1 from public.branches br where br.business_id = old.business_id and br.id <> old.id) then
    raise exception 'Un negocio necesita al menos una sucursal. Para cerrarlo entero, elimina el negocio.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger branches_keep_one before delete on public.branches
  for each row execute function private.keep_one_branch();

revoke execute on function private.keep_one_branch() from public, anon, authenticated;

-- Ventas y gastos apuntan a su turno sin cascada (un turno con historial se archiva, no se borra).
-- Para que al eliminar una sucursal se vaya con su historial, cuelgan también de la sucursal.
alter table public.sales
  add constraint sales_branch_id_fkey foreign key (branch_id) references public.branches (id) on delete cascade;
alter table public.expenses
  add constraint expenses_branch_id_fkey foreign key (branch_id) references public.branches (id) on delete cascade;

-- Las líneas de venta frenan el borrado de su producto (para no perder historial), y eso también frenaría la
-- cascada al eliminar el negocio. Por eso sus ventas se borran antes, en una sentencia propia. Es security definer
-- para que no se escapen las ventas que RLS oculta (historial de Gratis); quien llega aquí ya pasó la política de borrado.
create function private.clear_business_sales() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.sales s using public.branches br where br.id = s.branch_id and br.business_id = old.id;
  return old;
end;
$$;

create trigger businesses_clear_sales before delete on public.businesses
  for each row execute function private.clear_business_sales();

revoke execute on function private.clear_business_sales() from public, anon, authenticated;
