-- Invitaciones solo a cuentas existentes, que la persona acepta o rechaza, y bandeja de notificaciones.
-- Ver docs/modelo-de-datos.md.

-- Empleados ---------------------------------------------------------------

-- Con la regla nueva, una invitación sin cuenta no se puede aceptar.
delete from public.employees where person_id is null;

-- El nombre es de la persona: se lee de profiles.
alter table public.employees drop column first_name, drop column last_name;

-- Al invitar: la cuenta tiene que existir y quedar pendiente hasta que la persona acepte.
create or replace function private.link_invited_employee() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select u.id into new.person_id from auth.users u
  where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null;
  if new.person_id is null then
    raise exception 'No hay ninguna cuenta de Caja Simple con ese correo. Pídele que se registre primero.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.businesses b where b.id = new.business_id and b.owner_id = new.person_id) then
    raise exception 'Ya eres la dueña de este negocio.' using errcode = 'P0001';
  end if;
  new.status := 'invitado';
  return new;
end;
$$;

-- Registrarse o confirmar el correo ya no activa invitaciones: se aceptan desde la bandeja.
create or replace function private.handle_new_user() returns trigger
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
  return new;
end;
$$;

create or replace function private.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  return new;
end;
$$;

-- Notificaciones ----------------------------------------------------------

create type public.notification_kind as enum ('invitation', 'invitation_answer', 'cash_mismatch', 'low_stock');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  business_id uuid references public.businesses (id) on delete cascade,
  -- La invitación: si se quita o se rechaza, el aviso se va con ella.
  employee_id uuid references public.employees (id) on delete cascade,
  -- Nombres y montos al momento del aviso; la invitada todavía no puede leer el negocio por RLS.
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_business_idx on public.notifications (business_id);
create index notifications_employee_idx on public.notifications (employee_id);

alter table public.notifications enable row level security;

create policy "Ver tus avisos" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Marcar tus avisos como leídos" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Borrar tus avisos" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Desde la API solo se leen, se borran y se marcan como leídos; los crean las funciones de abajo.
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create function private.notify(p_user uuid, p_kind public.notification_kind, p_business uuid, p_employee uuid, p_data jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, kind, business_id, employee_id, data)
  values (p_user, p_kind, p_business, p_employee, p_data)
$$;

create function private.full_name(p_person uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(btrim(p.first_name || ' ' || p.last_name), ''), p.email) from public.profiles p where p.id = p_person
$$;

-- Aviso de invitación para la persona invitada.
create function private.on_employee_invited() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.notify(new.person_id, 'invitation', new.business_id, new.id, jsonb_build_object(
    'business', (select b.name from public.businesses b where b.id = new.business_id),
    'owner', (select private.full_name(b.owner_id) from public.businesses b where b.id = new.business_id),
    'branch', (select br.name from public.branches br where br.id = new.branch_id),
    'shift', (select s.name from public.shifts s where s.id = new.shift_id),
    'jobTitle', new.job_title
  ));
  return new;
end;
$$;

create trigger employees_notify_invited after insert on public.employees
  for each row execute function private.on_employee_invited();

-- La persona invitada acepta o rechaza. Solo puede responder sus invitaciones pendientes.
create function private.respond_invitation(p_employee uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_employee public.employees;
  v_owner uuid;
  v_business text;
begin
  select * into v_employee from public.employees e
  where e.id = p_employee and e.person_id = (select auth.uid()) and e.status = 'invitado'
  for update;
  if not found then
    raise exception 'Esta invitación ya no está disponible.' using errcode = 'P0001';
  end if;
  select b.owner_id, b.name into v_owner, v_business from public.businesses b where b.id = v_employee.business_id;

  if p_accept then
    update public.employees set status = 'activo' where id = p_employee;
    update public.notifications set read_at = coalesce(read_at, now()) where employee_id = p_employee;
  else
    -- Al borrar la fila se va también su aviso; la dueña puede volver a invitar.
    delete from public.employees where id = p_employee;
  end if;

  perform private.notify(v_owner, 'invitation_answer', v_employee.business_id, null, jsonb_build_object(
    'person', private.full_name(v_employee.person_id),
    'business', v_business,
    'accepted', p_accept
  ));
end;
$$;

create function public.respond_invitation(p_employee uuid, p_accept boolean) returns void
language sql security invoker set search_path = ''
as $$ select private.respond_invitation(p_employee, p_accept) $$;

-- Caja descuadrada: al cerrar un turno con diferencia, avisa a la dueña (si no cerró ella).
create function private.on_shift_closed_notify() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
  v_owner uuid;
  v_expected numeric(12, 2);
  v_difference numeric(12, 2);
begin
  select br.business_id, b.owner_id into v_business, v_owner
  from public.branches br join public.businesses b on b.id = br.business_id
  where br.id = new.branch_id;
  if v_owner = (select auth.uid()) then
    return new;
  end if;

  v_expected := new.opening
    + coalesce((select sum(t.total) from public.sale_totals t where t.shift_id = new.shift_id and t.business_date = new.business_date), 0)
    - coalesce((select sum(g.amount) from public.expenses g where g.shift_id = new.shift_id and g.business_date = new.business_date), 0);
  v_difference := new.counted - v_expected;
  if v_difference <> 0 then
    perform private.notify(v_owner, 'cash_mismatch', v_business, null, jsonb_build_object(
      'branch', (select br.name from public.branches br where br.id = new.branch_id),
      'shift', (select s.name from public.shifts s where s.id = new.shift_id),
      'date', new.business_date,
      'difference', v_difference
    ));
  end if;
  return new;
end;
$$;

create trigger shift_closes_notify_mismatch after update on public.shift_closes
  for each row when (old.status = 'en-curso' and new.status = 'cerrado')
  execute function private.on_shift_closed_notify();

-- Stock bajo: cada línea de venta descuenta el stock; si cruza el mínimo, avisa a la dueña una vez.
create or replace function private.apply_sale_item() returns trigger
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

  if v_item.stock > v_item.min_stock and v_item.stock - new.qty <= v_item.min_stock then
    perform private.notify(
      (select b.owner_id from public.businesses b where b.id = v_item.business_id),
      'low_stock', v_item.business_id, null, jsonb_build_object(
        'product', (select p.name from public.products p where p.id = new.product_id),
        'branch', (select br.name from public.branches br where br.id = v_branch),
        'stock', v_item.stock - new.qty,
        'minStock', v_item.min_stock
      ));
  end if;
  return new;
end;
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function public.respond_invitation(uuid, boolean) from public, anon;
grant execute on function public.respond_invitation(uuid, boolean) to authenticated;
-- Solo las usan otras funciones security definer: nadie las llama directo.
revoke execute on function private.notify(uuid, public.notification_kind, uuid, uuid, jsonb) from authenticated;
revoke execute on function private.full_name(uuid) from authenticated;
