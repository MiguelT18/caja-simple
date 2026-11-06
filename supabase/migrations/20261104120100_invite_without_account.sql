-- Invitar a quien todavía no tiene cuenta. La invitación queda con person_id en null y la base pide a la
-- Edge Function send-invite que mande el correo de invitación de Supabase Auth (crea la cuenta sin confirmar).
-- Al confirmar el correo (aceptando la invitación o registrándose), se vincula y le llega el aviso a la bandeja,
-- donde la acepta como cualquier otra. Quien ya tiene cuenta recibe solo el aviso y el push, como antes.

create or replace function private.link_invited_employee() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.email, '') = '' and new.person_id is not null then
    select u.email into new.email from auth.users u
    where u.id = new.person_id and u.email_confirmed_at is not null;
    if new.email is null then
      raise exception 'Esa cuenta ya no está disponible. Búscala de nuevo.' using errcode = 'P0001';
    end if;
  else
    -- Sin cuenta confirmada con ese correo, person_id queda en null: se vincula al confirmar.
    select u.id into new.person_id from auth.users u
    where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null;
  end if;
  if exists (select 1 from public.businesses b where b.id = new.business_id and b.owner_id = new.person_id) then
    raise exception 'Ya eres la dueña de este negocio.' using errcode = 'P0001';
  end if;
  new.status := 'invitado';
  return new;
end;
$$;

-- El aviso de invitación, para usarlo al invitar y al vincular.
create function private.notify_invitation(e public.employees) returns void
language sql security definer set search_path = ''
as $$
  select private.notify(e.person_id, 'invitation', e.business_id, e.id, jsonb_build_object(
    'business', (select b.name from public.businesses b where b.id = e.business_id),
    'owner', (select private.full_name(b.owner_id) from public.businesses b where b.id = e.business_id),
    'branch', (select br.name from public.branches br where br.id = e.branch_id),
    'shift', (select s.name from public.shifts s where s.id = e.shift_id),
    'jobTitle', e.job_title
  ))
$$;

create or replace function private.on_employee_invited() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if new.person_id is not null then
    perform private.notify_invitation(new);
    return new;
  end if;
  -- Sin cuenta: el correo lo manda send-invite (asíncrono, con pg_net). Mismos secretos de Vault que send-push.
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/send-invite',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object(
      'email', new.email,
      'business', (select b.name from public.businesses b where b.id = new.business_id),
      'owner', (select private.full_name(b.owner_id) from public.businesses b where b.id = new.business_id)
    )
  );
  return new;
end;
$$;

-- Al confirmar el correo: se vinculan las invitaciones pendientes a ese correo y llega su aviso.
create or replace function private.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_employee public.employees;
begin
  update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  for v_employee in
    update public.employees set person_id = new.id
    where person_id is null and status = 'invitado' and lower(email) = lower(new.email)
      and not exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = new.id)
    returning *
  loop
    perform private.notify_invitation(v_employee);
  end loop;
  return new;
end;
$$;

revoke execute on function private.notify_invitation(public.employees) from public, anon, authenticated;
