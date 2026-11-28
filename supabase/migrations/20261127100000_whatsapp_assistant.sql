-- Asistente de WhatsApp, etapa 1: responde consultas de clientes por el WhatsApp del negocio.
--
-- · Complemento aparte de los planes: vale hasta businesses.assistant_until (incluido); lo carga el admin tras el cobro.
-- · La Edge Function `whatsapp` recibe el webhook de Meta, decide el negocio por phone_number_id (nunca el modelo) y
--   llama a las herramientas wa_* con la clave de servicio: solo service_role puede ejecutarlas.
-- · El asistente calla si el complemento venció, si la dueña lo pausó (wa_accounts.paused_at), si ella escribió hace
--   poco en esa conversación desde la app de WhatsApp Business (muted_until) o si se pasó a una persona (handoff_at).

alter type public.notification_kind add value if not exists 'wa_handoff';

alter table public.businesses add column assistant_until date;
comment on column public.businesses.assistant_until is 'Asistente de WhatsApp contratado hasta (incluido); null = sin el complemento.';

create function private.assistant_active(p_business uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select b.assistant_until >= private.today() from public.businesses b where b.id = p_business), false)
$$;
revoke execute on function private.assistant_active(uuid) from public, anon;
grant execute on function private.assistant_active(uuid) to authenticated, service_role;

-- Un número de WhatsApp por negocio. El token de acceso va en Vault (token_secret_id), nunca en una columna.
create table public.wa_accounts (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  phone_number_id text not null unique,
  waba_id text,
  display_phone text,
  token_secret_id uuid,
  paused_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  wa_id text not null check (wa_id ~ '^[0-9]{6,20}$'),
  name text check (char_length(name) <= 120),
  last_customer_at timestamptz,
  muted_until timestamptz,
  handoff_at timestamptz,
  handoff_reason text check (char_length(handoff_reason) <= 200),
  created_at timestamptz not null default now(),
  unique (business_id, wa_id)
);
create index wa_conversations_business_last_idx on public.wa_conversations (business_id, last_customer_at desc);

create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Meta reintenta el webhook hasta 7 días: el id del mensaje evita guardarlo (y responderlo) dos veces.
  wa_message_id text unique,
  sender text not null check (sender in ('cliente', 'asistente', 'dueña')),
  body text not null check (char_length(body) <= 4096),
  created_at timestamptz not null default now()
);
create index wa_messages_conversation_idx on public.wa_messages (conversation_id, created_at desc);
create index wa_messages_business_idx on public.wa_messages (business_id);

alter table public.wa_accounts enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
create policy "La dueña ve su WhatsApp" on public.wa_accounts for select to authenticated
  using ((select private.is_owner(business_id)));
create policy "La dueña ve las conversaciones" on public.wa_conversations for select to authenticated
  using ((select private.is_owner(business_id)));
create policy "La dueña ve los mensajes" on public.wa_messages for select to authenticated
  using ((select private.is_owner(business_id)));
create policy "Exige la verificación en dos pasos" on public.wa_accounts as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "Exige la verificación en dos pasos" on public.wa_conversations as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
create policy "Exige la verificación en dos pasos" on public.wa_messages as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));
revoke all on public.wa_accounts, public.wa_conversations, public.wa_messages from anon;
revoke insert, update, delete on public.wa_accounts, public.wa_conversations, public.wa_messages from authenticated;
-- El token no se lee desde la app.
revoke select on public.wa_accounts from authenticated;
grant select (business_id, phone_number_id, display_phone, paused_at, created_at) on public.wa_accounts to authenticated;

-- ── Para la Edge Function (solo service_role) ────────────────────────────────────────────────────────────────────

-- El negocio de un número, con su token y si el asistente puede responder.
create function public.wa_account(p_phone_number_id text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'business_id', b.id,
    'business', b.name,
    'token', (select s.decrypted_secret from vault.decrypted_secrets s where s.id = a.token_secret_id),
    'active', private.assistant_active(b.id) and a.paused_at is null,
    'branches', (select coalesce(jsonb_agg(jsonb_build_object('id', br.id, 'name', br.name, 'address', br.address)
                   order by br.created_at), '[]') from public.branches br where br.business_id = b.id)
  )
  from public.wa_accounts a join public.businesses b on b.id = a.business_id
  where a.phone_number_id = p_phone_number_id
$$;

-- Productos por nombre (sin tildes ni mayúsculas: private.fold) con su precio y stock en cada sucursal donde se venden. Sin fila = no lo tiene.
create function public.wa_buscar_producto(p_business uuid, p_query text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item), '[]') from (
    select jsonb_build_object(
      'producto', p.name,
      'sucursales', jsonb_agg(jsonb_build_object(
        'sucursal', br.name,
        'precio_bs', i.price,
        -- null = la sucursal no lleva el stock de ese producto.
        'stock', i.stock
      ) order by br.created_at)
    ) as item
    from public.products p
    join public.inventory i on i.product_id = p.id and i.business_id = p_business
    join public.branches br on br.id = i.branch_id
    where p.business_id = p_business
      and char_length(btrim(coalesce(p_query, ''))) between 1 and 80
      and private.fold(p.name) like '%' || private.fold(btrim(p_query)) || '%'
    group by p.id, p.name
    order by p.name
    limit 10
  ) x
$$;

-- Horario semanal de cada sucursal y los cierres de los próximos 7 días (misma regla que src/lib/schedule.ts:
-- sin fila ese día = abre todo el día; horas en null = no abre).
create function public.wa_horarios(p_business uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'hoy', private.today(),
    'dia_hoy', extract(isodow from private.today())::int,
    'sucursales', coalesce(jsonb_agg(jsonb_build_object(
      'sucursal', br.name,
      'direccion', br.address,
      'horario', (
        select jsonb_agg(jsonb_build_object(
          'dia', d.dow,
          'horario', case
            when h.dow is null then 'todo el día'
            when h.open_time is null then 'cerrado'
            else to_char(h.open_time, 'HH24:MI') || ' a ' || to_char(h.close_time, 'HH24:MI')
          end) order by d.dow)
        from generate_series(1, 7) d(dow)
        left join public.branch_hours h on h.branch_id = br.id and h.dow = d.dow
      ),
      'cierres', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'fecha', c.day,
          'cierre', case
            when c.shift_ids is not null then 'algunos turnos'
            when c.start_time is null then 'todo el día'
            else 'de ' || to_char(c.start_time, 'HH24:MI') || ' a ' || to_char(c.end_time, 'HH24:MI')
          end,
          'nota', c.note) order by c.day), '[]')
        from public.branch_closures c
        where c.branch_id = br.id and c.day between private.today() and private.today() + 7
      )
    ) order by br.created_at), '[]')
  )
  from public.branches br
  where br.business_id = p_business
$$;

-- Promociones vigentes desde hoy, con sus productos, sucursales y días.
create function public.wa_promociones(p_business uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'promocion', pr.name,
    'descuento', case pr.kind
      when 'percent' then pr.percent || '% menos'
      when 'price' then 'precio especial Bs ' || pr.price || ' por unidad'
      else 'lleva ' || pr.buy || ', paga ' || pr.pay
    end,
    'productos', (select jsonb_agg(p.name order by p.name) from public.promotion_products pp
                  join public.products p on p.id = pp.product_id where pp.promotion_id = pr.id),
    'sucursales', case when pr.branch_ids is null then to_jsonb('todas'::text)
                  else (select jsonb_agg(br.name) from public.branches br where br.id = any (pr.branch_ids)) end,
    -- 1 = lunes … 7 = domingo; null = todos los días.
    'dias', pr.weekdays,
    'desde', pr.starts_on,
    'hasta', pr.ends_on
  ) order by pr.name), '[]')
  from public.promotions pr
  where pr.business_id = p_business and pr.active
    and private.effective_plan(p_business) <> 'Gratis'
    and (pr.ends_on is null or pr.ends_on >= private.today())
$$;

-- La conversación pasa a una persona: el asistente calla hasta que la dueña lo reactive, y ella recibe un aviso.
create function public.wa_pasar_a_persona(p_business uuid, p_conversation uuid, p_motivo text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_conv public.wa_conversations;
begin
  update public.wa_conversations
  set handoff_at = now(), handoff_reason = left(nullif(btrim(p_motivo), ''), 200)
  where id = p_conversation and business_id = p_business
  returning * into v_conv;
  if v_conv.id is null then
    return;
  end if;
  perform private.notify(b.owner_id, 'wa_handoff', b.id, null, jsonb_build_object(
    'customer', coalesce(v_conv.name, '+' || v_conv.wa_id),
    'reason', v_conv.handoff_reason
  ))
  from public.businesses b where b.id = p_business;
end;
$$;

revoke execute on function public.wa_account(text), public.wa_buscar_producto(uuid, text), public.wa_horarios(uuid),
  public.wa_promociones(uuid), public.wa_pasar_a_persona(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wa_account(text), public.wa_buscar_producto(uuid, text), public.wa_horarios(uuid),
  public.wa_promociones(uuid), public.wa_pasar_a_persona(uuid, uuid, text) to service_role;

-- ── Para la dueña desde la app ───────────────────────────────────────────────────────────────────────────────────

create function public.wa_set_paused(p_business uuid, p_paused boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  if not private.is_owner(p_business) then
    raise exception 'Solo la dueña pausa el asistente.' using errcode = '42501';
  end if;
  update public.wa_accounts set paused_at = case when p_paused then now() end where business_id = p_business;
end;
$$;

-- Vuelve a responder en esa conversación (después de pasar a una persona o de que escribiera la dueña).
create function public.wa_resume_conversation(p_conversation uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  update public.wa_conversations c set muted_until = null, handoff_at = null, handoff_reason = null
  where c.id = p_conversation and private.is_owner(c.business_id);
  if not found then
    raise exception 'Esa conversación no es de tu negocio.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.wa_set_paused(uuid, boolean), public.wa_resume_conversation(uuid) from public, anon;
grant execute on function public.wa_set_paused(uuid, boolean), public.wa_resume_conversation(uuid) to authenticated;
