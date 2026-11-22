-- Avisos en vivo: cada aviso nuevo se anuncia por Realtime Broadcast en el canal privado de su destinataria
-- («persona:<id>»), así la campana se actualiza sin recargar. Igual que 20261109191358_business_live.sql, el mensaje no
-- lleva el contenido (solo el tipo): el navegador vuelve a pedir la página y el servidor arma la bandeja con RLS.

-- Escucha su propio canal, con la 2FA verificada si la tiene. Sin insert: solo emite la base.
create policy "Avisos en vivo: tu bandeja" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'persona:' || (select auth.uid())::text
    and (select private.mfa_ok())
  );

-- Si el aviso en vivo falla, la notificación se guarda igual.
create function private.broadcast_notification() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform realtime.send(jsonb_build_object('kind', new.kind), 'notification', 'persona:' || new.user_id, true);
  exception when others then
    raise warning 'broadcast_notification: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function private.broadcast_notification() from public, anon, authenticated;

create trigger notifications_broadcast after insert on public.notifications
  for each row execute function private.broadcast_notification();
