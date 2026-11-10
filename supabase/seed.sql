-- Datos de ejemplo para la base LOCAL (supabase db reset). Nunca se corre en producción: `db push` no lee este archivo.
-- Todo es «Ejemplo»: no hay clientes ni métricas reales. Contraseña de todas las cuentas: ejemplo123.
--
--   duena@ejemplo.test     dueña de «Ejemplo Tienda» (plan Sucursales pagado, 2 sucursales)
--   empleada@ejemplo.test  empleada de Ejemplo Centro, turno Mañana
--   gratis@ejemplo.test    dueña de «Ejemplo Gratis» (plan Gratis, ya usó su prueba)
--   nueva@ejemplo.test     sin negocio: al crear el primero recibe la prueba de 30 días
--
-- Los negocios se crean con create_business como cada dueña (los mismos triggers que la app). El historial de la
-- última semana se inserta con los triggers apagados (session_replication_role = replica): la base no deja abrir
-- turnos ni vender en días pasados, y así el stock de hoy no se mueve.

-- Vault: a dónde llama la base para los avisos push e invitaciones (sin Edge Runtime en local, no salen).
select vault.create_secret('http://host.docker.internal:54321', 'project_url');
select vault.create_secret('local-dev-secret', 'push_webhook_secret');

-- Cuentas ----------------------------------------------------------------------------------------------------------
-- Los campos de token van en '' (no null): GoTrue no acepta null ahí.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('ejemplo123', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb, jsonb_build_object('first_name', u.first_name, 'last_name', 'Ejemplo'),
  now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-a000-000000000001'::uuid, 'duena@ejemplo.test', 'Dueña'),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'empleada@ejemplo.test', 'Empleada'),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'gratis@ejemplo.test', 'Gratis'),
  ('00000000-0000-4000-a000-000000000004'::uuid, 'nueva@ejemplo.test', 'Nueva')
) as u (id, email, first_name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email like '%@ejemplo.test';

-- Negocios, como cada dueña ---------------------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated", "aal": "aal1"}', false);
select public.create_business(
  p_name => 'Ejemplo Tienda', p_slug => 'ejemplo-tienda',
  p_branch_name => 'Ejemplo Centro', p_branch_slug => 'ejemplo-centro', p_branch_address => 'Calle Ejemplo 123',
  p_shifts => '[{"name": "Mañana", "start": "07:00", "end": "14:00", "tone": "morning"},
                {"name": "Tarde", "start": "14:00", "end": "21:00", "tone": "afternoon"},
                {"name": "Noche", "start": "21:00", "end": "23:59", "tone": "night"}]',
  p_kind => 'tienda', p_description => 'Negocio de ejemplo para desarrollar en local.', p_listed => false
);
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000003", "role": "authenticated", "aal": "aal1"}', false);
select public.create_business(
  p_name => 'Ejemplo Gratis', p_slug => 'ejemplo-gratis',
  p_branch_name => 'Ejemplo Única', p_branch_slug => 'ejemplo-unica', p_branch_address => 'Avenida Ejemplo 45',
  p_shifts => '[{"name": "Mañana", "start": "07:00", "end": "14:00", "tone": "morning"},
                {"name": "Tarde", "start": "14:00", "end": "21:00", "tone": "afternoon"}]',
  p_kind => 'tienda', p_description => 'Negocio de ejemplo en el plan Gratis.', p_listed => false
);
reset role;
select set_config('request.jwt.claims', '', false);

-- Planes: Ejemplo Tienda pagó Sucursales; Ejemplo Gratis ya terminó su prueba.
update public.businesses set plan = 'Sucursales', plan_until = private.today() + 30, trial = false where slug = 'ejemplo-tienda';
update public.businesses set plan = 'Gratis', plan_until = null, trial = false where slug = 'ejemplo-gratis';

-- Segunda sucursal de Ejemplo Tienda, con sus turnos.
with b as (select id from public.businesses where slug = 'ejemplo-tienda'),
br as (
  insert into public.branches (business_id, name, slug, address)
  select id, 'Ejemplo Norte', 'ejemplo-norte', 'Calle Ejemplo 900' from b
  returning id
)
insert into public.shifts (branch_id, name, start_time, end_time, tone)
select br.id, s.name, s.start_time, s.end_time, s.tone::public.shift_tone
from br, (values ('Mañana', time '07:00', time '14:00', 'morning'), ('Tarde', time '14:00', time '21:00', 'afternoon')) as s (name, start_time, end_time, tone);

-- Catálogo e inventario --------------------------------------------------------------------------------------------
do $$
declare
  v_business uuid := (select id from public.businesses where slug = 'ejemplo-tienda');
  v_gratis uuid := (select id from public.businesses where slug = 'ejemplo-gratis');
  v_cat uuid;
  r record;
begin
  for r in
    select * from (values
      ('Bebidas', 'Agua 2 L', 6.00, '7790000000011'), ('Bebidas', 'Gaseosa 2 L', 12.00, '7790000000028'), ('Bebidas', 'Jugo 1 L', 9.50, null),
      ('Lácteos', 'Leche 1 L', 7.50, '7790000000035'), ('Lácteos', 'Yogur 1 L', 12.00, null),
      ('Panadería', 'Pan de batalla', 0.50, null), ('Panadería', 'Marraqueta', 0.60, null),
      ('Abarrotes', 'Arroz 1 kg', 9.00, null), ('Abarrotes', 'Azúcar 1 kg', 7.00, null), ('Abarrotes', 'Aceite 1 L', 16.00, null)
    ) as p (category, name, price, barcode)
  loop
    select id into v_cat from public.categories where business_id = v_business and name = r.category;
    if v_cat is null then
      insert into public.categories (business_id, name) values (v_business, r.category) returning id into v_cat;
    end if;
    with prod as (
      insert into public.products (business_id, category_id, name, barcode) values (v_business, v_cat, r.name, r.barcode) returning id
    )
    -- En las dos sucursales; el aceite queda con poco stock para ver el aviso.
    insert into public.inventory (business_id, branch_id, product_id, price, stock, min_stock)
    select v_business, br.id, prod.id, r.price, case when r.name = 'Aceite 1 L' then 3 else 40 end, 10
    from prod, public.branches br where br.business_id = v_business;
  end loop;

  -- Ejemplo Gratis: pocos productos, sin control de stock (es del plan Negocio).
  for r in select * from (values ('Café', 5.00), ('Té', 3.00), ('Galletas', 4.50)) as p (name, price) loop
    with prod as (insert into public.products (business_id, name) values (v_gratis, r.name) returning id)
    insert into public.inventory (business_id, branch_id, product_id, price, stock, min_stock)
    select v_gratis, br.id, prod.id, r.price, null, null from prod, public.branches br where br.business_id = v_gratis;
  end loop;
end;
$$;

-- Equipo: la empleada en Ejemplo Centro, turno Mañana.
insert into public.employees (business_id, branch_id, email, job_title, person_id, shift_id, status)
select b.id, br.id, 'empleada@ejemplo.test', 'Cajera', '00000000-0000-4000-a000-000000000002', s.id, 'activo'
from public.businesses b
join public.branches br on br.business_id = b.id and br.slug = 'ejemplo-centro'
join public.shifts s on s.branch_id = br.id and s.name = 'Mañana'
where b.slug = 'ejemplo-tienda';

-- Historial: la última semana de Ejemplo Tienda (hoy queda libre para abrir turno y vender) -------------------------
set session_replication_role = replica;
do $$
declare
  v_business uuid := (select id from public.businesses where slug = 'ejemplo-tienda');
  v_today date := private.today();
  v_day date;
  v_shift record;
  v_close uuid;
  v_sale uuid;
  v_cash numeric;
  v_spent numeric;
  v_at timestamptz;
  v_product record;
  v_by uuid;
  n int;
begin
  for d in 1..7 loop
    v_day := v_today - d;
    for v_shift in
      select s.*, br.slug as branch_slug from public.shifts s join public.branches br on br.id = s.branch_id
      where br.business_id = v_business and s.name in ('Mañana', 'Tarde')
    loop
      v_by := case when v_shift.branch_slug = 'ejemplo-centro' and v_shift.name = 'Mañana'
        then '00000000-0000-4000-a000-000000000002'::uuid else '00000000-0000-4000-a000-000000000001'::uuid end;
      v_close := gen_random_uuid();
      v_cash := 0;
      -- Entre 3 y 8 ventas por turno, repartidas en las horas del turno.
      for n in 1..(3 + (abs(hashtext(v_day::text || v_shift.id::text)) % 6)) loop
        v_sale := gen_random_uuid();
        v_at := ((v_day + v_shift.start_time + make_interval(mins => n * 40)) at time zone 'America/La_Paz');
        insert into public.sales (id, branch_id, shift_id, business_date, occurred_at, payment_method, recorded_by)
        values (v_sale, v_shift.branch_id, v_shift.id, v_day, v_at, (array['efectivo', 'efectivo', 'qr', 'transferencia'])[1 + n % 4]::public.payment_method, v_by);
        for v_product in
          select i.product_id, i.price from public.inventory i
          where i.branch_id = v_shift.branch_id order by md5(v_sale::text || i.product_id::text) limit 1 + n % 3
        loop
          insert into public.sale_items (sale_id, product_id, qty, unit_price, discount)
          values (v_sale, v_product.product_id, 1 + n % 2, v_product.price, 0);
          if (array['efectivo', 'efectivo', 'qr', 'transferencia'])[1 + n % 4] = 'efectivo' then
            v_cash := v_cash + v_product.price * (1 + n % 2);
          end if;
        end loop;
      end loop;
      -- Un gasto cada tanto, pagado con la caja.
      v_spent := case when d % 2 = 0 then 15 else 0 end;
      if v_spent > 0 then
        insert into public.expenses (branch_id, shift_id, business_date, occurred_at, concept, category, amount, recorded_by)
        values (v_shift.branch_id, v_shift.id, v_day, v_at + interval '10 minutes', 'Bolsas (ejemplo)', 'Insumos', v_spent, v_by);
      end if;
      -- Turno cerrado; un día la caja no cuadra por Bs 2, para ver cómo se muestra.
      insert into public.shift_closes (id, branch_id, shift_id, business_date, status, opening, counted, opened_by, opened_at, closed_by, closed_at)
      values (
        v_close, v_shift.branch_id, v_shift.id, v_day, 'cerrado', 100, 100 + v_cash - v_spent - case when d = 3 then 2 else 0 end,
        v_by, ((v_day + v_shift.start_time) at time zone 'America/La_Paz'), v_by, ((v_day + v_shift.end_time) at time zone 'America/La_Paz')
      );
    end loop;
  end loop;
end;
$$;
set session_replication_role = origin;
