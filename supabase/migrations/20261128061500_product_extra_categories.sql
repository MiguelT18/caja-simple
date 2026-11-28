-- Un producto puede estar en varias categorías: category_id sigue siendo la principal (la de los gráficos, reportes y
-- exportes, así ninguna venta se cuenta dos veces) y extra_category_ids las otras, que sirven para filtrar y buscar.
-- Sin FK por elemento (como employees.shift_ids): un trigger exige que sean del negocio y otro las quita al borrar
-- la categoría. Un arreglo y no una tabla puente: así products → categories sigue siendo una sola relación en la API.

alter table public.products add column extra_category_ids uuid[] not null default '{}';
create index products_extra_category_ids_idx on public.products using gin (extra_category_ids);

-- Sin repetidos, sin la principal y todas del negocio del producto.
create function private.check_product_categories() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.extra_category_ids := array(
    select distinct x from unnest(new.extra_category_ids) as u(x) where x is distinct from new.category_id
  );
  if exists (
    select 1 from unnest(new.extra_category_ids) as u(id)
    where not exists (select 1 from public.categories c where c.id = u.id and c.business_id = new.business_id)
  ) then
    raise exception 'Esa categoría es de otro negocio o ya no existe.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_product_categories() from public, anon, authenticated;

create trigger products_check_categories
  before insert or update of extra_category_ids, category_id, business_id on public.products
  for each row execute function private.check_product_categories();

-- Una categoría borrada deja de estar en los productos (la principal ya queda en null por la FK).
create function private.forget_category() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.products set extra_category_ids = array_remove(extra_category_ids, old.id)
  where business_id = old.business_id and extra_category_ids @> array[old.id];
  return null;
end;
$$;
revoke execute on function private.forget_category() from public, anon, authenticated;

create trigger categories_forget_deleted
  after delete on public.categories
  for each row execute function private.forget_category();
