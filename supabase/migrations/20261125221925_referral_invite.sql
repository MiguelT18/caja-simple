-- Página de invitación de /r/<código>: quién invita, para que el enlace diga «Ana T. te invita». Solo el nombre y la
-- inicial del apellido de un afiliado activo (el afiliado comparte su enlace en público). Sin fila, el código no vale.
create function public.referral_invite(p_code text) returns table (name text)
language sql stable security definer set search_path = ''
as $$
  select btrim(p.first_name) || coalesce(' ' || nullif(upper(left(btrim(p.last_name), 1)), '') || '.', '')
  from public.affiliates a join public.profiles p on p.id = a.id
  where a.code = lower(btrim(p_code)) and a.active
$$;
revoke execute on function public.referral_invite(text) from public;
grant execute on function public.referral_invite(text) to anon, authenticated;
