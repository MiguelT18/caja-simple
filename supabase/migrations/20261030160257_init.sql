-- Caja Simple: esquema inicial. Ver docs/modelo-de-datos.md.
-- Persona → negocios → sucursales → (turnos, inventario, ventas, gastos, cierres).
-- Autorización: RLS en todas las tablas. La dueña puede todo en su negocio; la empleada,
-- solo lo de su sucursal. Las funciones de apoyo viven en `private`, que no expone la API.

create schema if not exists private;
grant usage on schema private to authenticated;

create type public.plan as enum ('Gratis', 'Negocio', 'Sucursales');
create type public.shift_tone as enum ('morning', 'afternoon', 'night');
create type public.employee_status as enum ('activo', 'invitado');
create type public.close_status as enum ('en-curso', 'cerrado');

-- "Hoy" del negocio: los montos y turnos se cuentan en hora de Bolivia.
create function private.today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/La_Paz')::date $$;
grant execute on function private.today() to authenticated;

-- Tablas -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  plan public.plan not null default 'Gratis',
  created_at timestamptz not null default now()
);
create index businesses_owner_idx on public.businesses (owner_id);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  address text not null default '',
  created_at timestamptz not null default now(),
  unique (business_id, slug),
  unique (id, business_id)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  start_time time not null,
  end_time time not null,
  tone public.shift_tone not null,
  created_at timestamptz not null default now(),
  unique (id, branch_id)
);
create index shifts_branch_idx on public.shifts (branch_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (id, business_id)
);
create unique index categories_name_idx on public.categories (business_id, lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid,
  name text not null check (length(btrim(name)) between 1 and 80),
  -- EAN-13 u otro código del envase; los productos a granel no tienen.
  barcode text check (barcode ~ '^[0-9]{6,14}$'),
  image_path text,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  -- La categoría tiene que ser del mismo negocio; si se borra, el producto queda sin categoría.
  foreign key (category_id, business_id) references public.categories (id, business_id) on delete set null (category_id)
);
create index products_business_idx on public.products (business_id);
create index products_category_idx on public.products (category_id);
create unique index products_barcode_idx on public.products (business_id, barcode) where barcode is not null;

create table public.inventory (
  business_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null,
  price numeric(12, 2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  primary key (branch_id, product_id),
  -- Sucursal y producto del mismo negocio.
  foreign key (branch_id, business_id) references public.branches (id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products (id, business_id) on delete cascade
);
create index inventory_product_idx on public.inventory (product_id, business_id);
create index inventory_branch_business_idx on public.inventory (branch_id, business_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  branch_id uuid not null,
  shift_id uuid references public.shifts (id) on delete set null,
  -- Cuenta de la persona: se vincula sola cuando se registra con el correo invitado.
  person_id uuid references public.profiles (id) on delete set null,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name text not null check (length(btrim(first_name)) between 1 and 60),
  last_name text not null default '',
  job_title text not null default '',
  status public.employee_status not null default 'invitado',
  created_at timestamptz not null default now(),
  foreign key (branch_id, business_id) references public.branches (id, business_id) on delete cascade
);
create unique index employees_email_idx on public.employees (business_id, lower(email));
create index employees_person_idx on public.employees (person_id);
create index employees_branch_idx on public.employees (branch_id, business_id);
create index employees_shift_idx on public.employees (shift_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null,
  shift_id uuid not null,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  occurred_at timestamptz not null default now(),
  business_date date not null default private.today(),
  foreign key (shift_id, branch_id) references public.shifts (id, branch_id)
);
create index sales_branch_date_idx on public.sales (branch_id, business_date);
create index sales_shift_idx on public.sales (shift_id, branch_id);
create index sales_recorded_by_idx on public.sales (recorded_by);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid not null references public.products (id),
  qty integer not null check (qty > 0),
  -- Precio copiado del inventario al vender: el historial no cambia si cambia el precio.
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_product_idx on public.sale_items (product_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null,
  shift_id uuid not null,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  occurred_at timestamptz not null default now(),
  business_date date not null default private.today(),
  concept text not null check (length(btrim(concept)) between 1 and 120),
  category text not null check (length(btrim(category)) between 1 and 40),
  amount numeric(12, 2) not null check (amount > 0),
  foreign key (shift_id, branch_id) references public.shifts (id, branch_id)
);
create index expenses_branch_date_idx on public.expenses (branch_id, business_date);
create index expenses_shift_idx on public.expenses (shift_id, branch_id);
create index expenses_recorded_by_idx on public.expenses (recorded_by);

create table public.shift_closes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null,
  shift_id uuid not null,
  business_date date not null default private.today(),
  status public.close_status not null default 'en-curso',
  opening numeric(12, 2) not null check (opening >= 0),
  -- Lo contado al cerrar; la diferencia es contado − esperado y se calcula al leer.
  counted numeric(12, 2) check (counted >= 0),
  opened_by uuid not null default auth.uid() references public.profiles (id),
  closed_at timestamptz,
  unique (shift_id, business_date),
  check ((status = 'cerrado') = (counted is not null)),
  foreign key (shift_id, branch_id) references public.shifts (id, branch_id) on delete cascade
);
create index shift_closes_branch_date_idx on public.shift_closes (branch_id, business_date);
create index shift_closes_opened_by_idx on public.shift_closes (opened_by);

-- Total de cada venta, para resúmenes y gráficos. security_invoker: respeta RLS.
create view public.sale_totals with (security_invoker = true) as
select s.id as sale_id, s.branch_id, s.shift_id, s.business_date, s.occurred_at, s.recorded_by,
       sum(i.qty * i.unit_price)::numeric(12, 2) as total, sum(i.qty)::integer as items
from public.sales s
join public.sale_items i on i.sale_id = s.id
group by s.id;

-- Funciones de apoyo para RLS ------------------------------------------------
-- security definer para leer membresías sin recursión de políticas; todas filtran por auth.uid().

create function private.is_owner(p_business uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.businesses b where b.id = p_business and b.owner_id = (select auth.uid()))
$$;

create function private.is_member(p_business uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_owner(p_business) or exists (
    select 1 from public.employees e
    where e.business_id = p_business and e.person_id = (select auth.uid()) and e.status = 'activo'
  )
$$;

create function private.owns_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.branches br join public.businesses b on b.id = br.business_id
    where br.id = p_branch and b.owner_id = (select auth.uid())
  )
$$;

create function private.can_use_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.owns_branch(p_branch) or exists (
    select 1 from public.employees e
    where e.branch_id = p_branch and e.person_id = (select auth.uid()) and e.status = 'activo'
  )
$$;

-- ¿Comparte algún negocio con esa persona? Para mostrar el nombre de quien registró.
create function private.shares_business(p_person uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.owner_id = (select auth.uid()) and exists (
      select 1 from public.employees e where e.business_id = b.id and e.person_id = p_person
    )
  ) or exists (
    select 1 from public.employees mine
    join public.businesses b on b.id = mine.business_id
    where mine.person_id = (select auth.uid()) and mine.status = 'activo'
      and (b.owner_id = p_person or exists (
        select 1 from public.employees e where e.business_id = b.id and e.person_id = p_person
      ))
  )
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- RLS ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.branches enable row level security;
alter table public.shifts enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.employees enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.shift_closes enable row level security;

create policy "Ver tu perfil y el de tu equipo" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_business(id)));
create policy "Editar tu perfil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Ver tus negocios" on public.businesses for select to authenticated
  using ((select private.is_member(id)));
create policy "Crear un negocio propio" on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "La dueña edita su negocio" on public.businesses for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "La dueña borra su negocio" on public.businesses for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "Ver sucursales a las que tienes acceso" on public.branches for select to authenticated
  using ((select private.is_owner(business_id)) or (select private.can_use_branch(id)));
create policy "La dueña crea sucursales" on public.branches for insert to authenticated
  with check ((select private.is_owner(business_id)));
create policy "La dueña edita sucursales" on public.branches for update to authenticated
  using ((select private.is_owner(business_id))) with check ((select private.is_owner(business_id)));
create policy "La dueña borra sucursales" on public.branches for delete to authenticated
  using ((select private.is_owner(business_id)));

create policy "Ver turnos de tus sucursales" on public.shifts for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "La dueña crea turnos" on public.shifts for insert to authenticated
  with check ((select private.owns_branch(branch_id)));
create policy "La dueña edita turnos" on public.shifts for update to authenticated
  using ((select private.owns_branch(branch_id))) with check ((select private.owns_branch(branch_id)));
create policy "La dueña borra turnos" on public.shifts for delete to authenticated
  using ((select private.owns_branch(branch_id)));

create policy "Ver categorías del negocio" on public.categories for select to authenticated
  using ((select private.is_member(business_id)));
create policy "La dueña crea categorías" on public.categories for insert to authenticated
  with check ((select private.is_owner(business_id)));
create policy "La dueña edita categorías" on public.categories for update to authenticated
  using ((select private.is_owner(business_id))) with check ((select private.is_owner(business_id)));
create policy "La dueña borra categorías" on public.categories for delete to authenticated
  using ((select private.is_owner(business_id)));

create policy "Ver el catálogo del negocio" on public.products for select to authenticated
  using ((select private.is_member(business_id)));
create policy "La dueña crea productos" on public.products for insert to authenticated
  with check ((select private.is_owner(business_id)));
create policy "La dueña edita productos" on public.products for update to authenticated
  using ((select private.is_owner(business_id))) with check ((select private.is_owner(business_id)));
create policy "La dueña borra productos" on public.products for delete to authenticated
  using ((select private.is_owner(business_id)));

create policy "Ver el inventario de tus sucursales" on public.inventory for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "La dueña agrega al inventario" on public.inventory for insert to authenticated
  with check ((select private.is_owner(business_id)));
create policy "La dueña edita el inventario" on public.inventory for update to authenticated
  using ((select private.is_owner(business_id))) with check ((select private.is_owner(business_id)));
create policy "La dueña quita del inventario" on public.inventory for delete to authenticated
  using ((select private.is_owner(business_id)));

create policy "La dueña ve su equipo; cada quien, su ficha" on public.employees for select to authenticated
  using ((select private.is_owner(business_id)) or person_id = (select auth.uid()));
create policy "La dueña invita empleados" on public.employees for insert to authenticated
  with check ((select private.is_owner(business_id)));
create policy "La dueña edita empleados" on public.employees for update to authenticated
  using ((select private.is_owner(business_id))) with check ((select private.is_owner(business_id)));
create policy "La dueña quita empleados" on public.employees for delete to authenticated
  using ((select private.is_owner(business_id)));

create policy "Ver ventas de tus sucursales" on public.sales for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "Registrar ventas en tus sucursales" on public.sales for insert to authenticated
  with check ((select private.can_use_branch(branch_id)) and recorded_by = (select auth.uid()));
create policy "La dueña borra ventas" on public.sales for delete to authenticated
  using ((select private.owns_branch(branch_id)));

create policy "Ver líneas de ventas de tus sucursales" on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id and (select private.can_use_branch(s.branch_id))));
create policy "Agregar líneas a tus ventas" on public.sale_items for insert to authenticated
  with check (exists (select 1 from public.sales s where s.id = sale_id and s.recorded_by = (select auth.uid())));

create policy "Ver gastos de tus sucursales" on public.expenses for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "Registrar gastos en tus sucursales" on public.expenses for insert to authenticated
  with check ((select private.can_use_branch(branch_id)) and recorded_by = (select auth.uid()));
create policy "La dueña edita gastos" on public.expenses for update to authenticated
  using ((select private.owns_branch(branch_id))) with check ((select private.owns_branch(branch_id)));
create policy "La dueña borra gastos" on public.expenses for delete to authenticated
  using ((select private.owns_branch(branch_id)));

create policy "Ver cierres de tus sucursales" on public.shift_closes for select to authenticated
  using ((select private.can_use_branch(branch_id)));
create policy "Abrir turno en tus sucursales" on public.shift_closes for insert to authenticated
  with check ((select private.can_use_branch(branch_id)) and opened_by = (select auth.uid()) and status = 'en-curso');
create policy "Cerrar turno en tus sucursales" on public.shift_closes for update to authenticated
  using ((select private.can_use_branch(branch_id)) and status = 'en-curso')
  with check ((select private.can_use_branch(branch_id)));

-- Desde 2026-10-30 las tablas nuevas no se exponen solas a la Data API: se otorgan aquí.
-- RLS decide qué filas; anon no tiene acceso a nada.
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- Triggers ----------------------------------------------------------------

-- Crea el perfil al registrarse y vincula invitaciones si el correo ya está confirmado.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- Los metadatos los escribe la persona: solo se usan para mostrar el nombre, nunca para autorizar.
  insert into public.profiles (id, email, first_name, last_name, avatar_url)
  values (
    new.id,
    new.email,
    left(coalesce(meta ->> 'first_name', meta ->> 'given_name', split_part(meta ->> 'full_name', ' ', 1), ''), 60),
    left(coalesce(meta ->> 'last_name', meta ->> 'family_name', nullif(substr(meta ->> 'full_name', length(split_part(meta ->> 'full_name', ' ', 1)) + 2), ''), ''), 60),
    meta ->> 'avatar_url'
  );
  if new.email_confirmed_at is not null then
    update public.employees set person_id = new.id, status = 'activo'
    where person_id is null and lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Al confirmar el correo (o cambiarlo), vincula las invitaciones pendientes.
create function private.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  update public.employees set person_id = new.id, status = 'activo'
  where person_id is null and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_confirmed after update of email_confirmed_at, email on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function private.handle_user_confirmed();

-- Al invitar a alguien que ya tiene cuenta confirmada, queda vinculado de una vez.
create function private.link_invited_employee() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.person_id is null then
    select u.id into new.person_id from auth.users u
    where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null;
    if new.person_id is not null then new.status := 'activo'; end if;
  end if;
  return new;
end;
$$;

create trigger employees_link_person before insert on public.employees
  for each row execute function private.link_invited_employee();

-- Cada línea de venta toma el precio del inventario y descuenta el stock.
-- security definer: la empleada no puede editar el inventario, pero vender sí lo descuenta.
create function private.apply_sale_item() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_branch uuid;
  v_item public.inventory;
begin
  select s.branch_id into v_branch from public.sales s where s.id = new.sale_id;
  select * into v_item from public.inventory i
  where i.branch_id = v_branch and i.product_id = new.product_id
  for update;
  if not found then
    raise exception 'Este producto no se vende en esta sucursal' using errcode = 'P0001';
  end if;
  if v_item.stock < new.qty then
    raise exception 'No hay stock suficiente (quedan %)', v_item.stock using errcode = 'P0001';
  end if;
  update public.inventory set stock = stock - new.qty
  where branch_id = v_branch and product_id = new.product_id;
  new.unit_price := v_item.price;
  return new;
end;
$$;

create trigger sale_items_apply before insert on public.sale_items
  for each row execute function private.apply_sale_item();

-- Ventas y gastos solo en un turno abierto hoy.
create function private.require_open_shift() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.shift_closes c
    where c.shift_id = new.shift_id and c.business_date = new.business_date and c.status = 'en-curso'
  ) then
    raise exception 'El turno no está abierto. Ábrelo en Turnos para registrar movimientos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sales_require_open_shift before insert on public.sales
  for each row execute function private.require_open_shift();
create trigger expenses_require_open_shift before insert on public.expenses
  for each row execute function private.require_open_shift();

-- Al cerrar se fija la hora; un turno cerrado no se vuelve a abrir.
create function private.on_shift_close() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'cerrado' and old.status = 'en-curso' then
    new.closed_at := now();
  end if;
  new.opening := old.opening;
  new.opened_by := old.opened_by;
  new.business_date := old.business_date;
  return new;
end;
$$;

create trigger shift_closes_on_close before update on public.shift_closes
  for each row execute function private.on_shift_close();

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- RPC ---------------------------------------------------------------------

-- Una venta y sus líneas en una sola transacción. security invoker: aplica RLS de quien vende.
create function public.register_sale(p_branch uuid, p_shift uuid, p_items jsonb) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_sale uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos' using errcode = 'P0001';
  end if;
  insert into public.sales (branch_id, shift_id) values (p_branch, p_shift) returning id into v_sale;
  insert into public.sale_items (sale_id, product_id, qty)
  select v_sale, (x ->> 'productId')::uuid, (x ->> 'qty')::integer
  from jsonb_array_elements(p_items) x;
  return v_sale;
end;
$$;

-- Crea el negocio con su primera sucursal y los tres turnos de siempre.
create function public.create_business(
  p_name text, p_slug text, p_branch_name text, p_branch_slug text, p_branch_address text default ''
) returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_business uuid;
  v_branch uuid;
begin
  insert into public.businesses (name, slug) values (btrim(p_name), p_slug) returning id into v_business;
  insert into public.branches (business_id, name, slug, address)
  values (v_business, btrim(p_branch_name), p_branch_slug, coalesce(btrim(p_branch_address), ''))
  returning id into v_branch;
  insert into public.shifts (branch_id, name, start_time, end_time, tone) values
    (v_branch, 'Mañana', '07:00', '14:00', 'morning'),
    (v_branch, 'Tarde', '14:00', '21:00', 'afternoon'),
    (v_branch, 'Noche', '21:00', '23:59', 'night');
  return p_slug;
end;
$$;

revoke execute on function public.register_sale(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.create_business(text, text, text, text, text) from public, anon;
grant execute on function public.register_sale(uuid, uuid, jsonb) to authenticated;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;

-- Storage -----------------------------------------------------------------

-- Fotos de productos: <business_id>/<product_id>. Privado; se muestran con URL firmada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create function private.folder_business(p_name text) returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function private.folder_business(text) to authenticated;

create policy "Ver fotos de productos del negocio" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select private.is_member(private.folder_business(name))));
create policy "La dueña sube fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select private.is_owner(private.folder_business(name))));
create policy "La dueña reemplaza fotos" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select private.is_owner(private.folder_business(name))))
  with check (bucket_id = 'product-images' and (select private.is_owner(private.folder_business(name))));
create policy "La dueña borra fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select private.is_owner(private.folder_business(name))));
