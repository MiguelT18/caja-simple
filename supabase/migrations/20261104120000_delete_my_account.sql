-- Borrar tu cuenta (Tu cuenta › Borrar la cuenta). Al borrar auth.users, la cascada borra el perfil y los
-- negocios de los que eres dueña, con todo su historial (ver delete_guards). En negocios ajenos tus ventas,
-- gastos y cierres quedan con quién los registró en null (keep_history_on_account_delete) y tus puestos de
-- empleada se quitan. Las fotos se borran antes, desde la Action: Storage no deja borrarlas por SQL.
create function private.delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Inicia sesión para seguir.' using errcode = '42501';
  end if;
  -- Security definer salta RLS, y con ella la política de la verificación en dos pasos: se exige aquí.
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  delete from public.employees where person_id = v_me;
  delete from auth.users where id = v_me;
end;
$$;

revoke execute on function private.delete_my_account() from public, anon, authenticated;
grant execute on function private.delete_my_account() to authenticated;

create function public.delete_my_account() returns void
language sql security invoker set search_path = ''
as $$ select private.delete_my_account() $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
