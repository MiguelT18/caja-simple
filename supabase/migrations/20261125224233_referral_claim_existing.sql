-- «Activar beneficio» en /r/<código>: quien ya tiene cuenta (nueva, sin pagos) deja su cuenta referida a mano, y el
-- beneficio también vale para los negocios propios que ya creó y nunca pagaron: quedan referidos (precio fundador
-- asegurado o mes gratis) y, si están en la prueba, esta se alarga a referral_trial_days. Antes solo valía para los
-- negocios que creara después, y la página lo activaba al abrirse.

-- Si la cuenta de la sesión puede quedar referida: 'si', 'ya' (ya tiene afiliado) o 'no' (vieja, con pagos o el propio
-- afiliado). Solo para la sesión: no dice nada de otras cuentas.
create function public.referral_claimable(p_code text) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when p.referred_by is not null then 'ya'
    when a.id is null or a.id = p.id or p.created_at <= now() - interval '7 days'
      or exists (select 1 from public.plan_charges c join public.businesses b on b.id = c.business_id
                 where b.owner_id = p.id and c.paid_at is not null) then 'no'
    else 'si'
  end
  from public.profiles p
  left join public.affiliates a on a.code = lower(btrim(p_code)) and a.active
  where p.id = auth.uid()
$$;
revoke execute on function public.referral_claimable(text) from public, anon;
grant execute on function public.referral_claimable(text) to authenticated;

-- Igual que en 20261112130000_affiliates.sql, más: los negocios propios sin pagos quedan referidos y su prueba se alarga.
create or replace function public.claim_referral(p_code text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_affiliate uuid;
  v_extra integer;
begin
  select a.id into v_affiliate from public.affiliates a where a.code = lower(btrim(p_code)) and a.active;
  if v_affiliate is null or v_affiliate = auth.uid() then
    return false;
  end if;
  if exists (
    select 1 from public.plan_charges c join public.businesses b on b.id = c.business_id
    where b.owner_id = auth.uid() and c.paid_at is not null
  ) then
    return false;
  end if;
  update public.profiles p set referred_by = v_affiliate
  where p.id = auth.uid() and p.referred_by is null and p.created_at > now() - interval '7 days';
  if not found then
    return false;
  end if;
  select s.referral_trial_days - 30 into v_extra from public.billing_settings s;
  -- Sin pagos (lo comprobado arriba): todos sus negocios propios. La prueba vigente suma los días que le faltan.
  update public.businesses b
  set referred_by = v_affiliate,
      plan_until = case when b.trial and b.plan_until >= private.today() and v_extra > 0 then b.plan_until + v_extra else b.plan_until end
  where b.owner_id = auth.uid() and b.referred_by is null;
  return true;
end;
$$;
