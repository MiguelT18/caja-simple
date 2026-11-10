-- La prueba de 30 días del plan Negocio, una sola vez por persona. Antes la daba cada negocio nuevo
-- (businesses_start_trial): quien estaba en Gratis creaba otro negocio, o borraba el suyo y lo volvía a crear, y
-- tenía promociones, stock y reportes otra vez sin pagar.

-- Quién ya usó la prueba. En private (fuera de la API): nadie puede borrarse de aquí para pedir otra.
-- Sin FK a profiles: si la cuenta se borra y se vuelve a crear, es otra persona (otro id) y no hay nada que limpiar.
create table private.trials (
  person_id uuid primary key,
  started_at timestamptz not null default now()
);
alter table private.trials enable row level security;

-- Ya la usó toda persona que tiene o tuvo un negocio: los que están en la prueba y los que empezaron en Gratis antes
-- de que existiera (esos no la tuvieron, pero un negocio nuevo no se la da ahora).
insert into private.trials (person_id)
select distinct owner_id from public.businesses where owner_id is not null
on conflict do nothing;

create or replace function private.start_trial() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Ya la usó: el negocio nuevo queda en Gratis.
  insert into private.trials (person_id) values (new.owner_id) on conflict do nothing;
  if not found then
    return null;
  end if;
  update public.businesses set plan = 'Negocio', plan_until = private.today() + 29, trial = true where id = new.id;
  return null;
end;
$$;

-- Crear un negocio solo con sus datos. Antes el permiso de INSERT cubría todas las columnas: la política exigía
-- plan = 'Gratis', pero se podía mandar plan_until, trial o founder_since (el precio de fundador sin haber pagado).
-- Lo del plan solo lo ponen las funciones de la base (start_trial, activate_plan_charge, plan_daily).
-- create_business (security invoker) inserta name, slug, kind, description y listed; el resto toma su default.
revoke insert on public.businesses from authenticated;
grant insert (name, slug, kind, description, listed, image_path) on public.businesses to authenticated;
