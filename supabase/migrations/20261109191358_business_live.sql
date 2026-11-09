-- Resumen del negocio en vivo: la base avisa por Realtime Broadcast (canal privado «negocio:<id>») cuando cambian
-- ventas, gastos o turnos de una sucursal. El aviso no lleva datos del negocio (solo la sucursal y la operación):
-- el navegador vuelve a pedir la página y el servidor la arma como siempre. Ver docs/modelo-de-datos.md › En vivo.

-- ¿Puede quien se conecta escuchar este canal? Solo quien administra el negocio, con la 2FA verificada si la tiene.
-- El formato se valida antes del cast: un topic cualquiera da false, no un error.
create function private.watch_topic(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_topic ~ '^negocio:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_owner(substr(p_topic, 9)::uuid)
    and private.mfa_ok()
$$;
revoke execute on function private.watch_topic(text) from public, anon;
grant execute on function private.watch_topic(text) to authenticated;

-- Solo lectura: ningún cliente puede emitir en estos canales (no hay política de insert); emite la base.
create policy "Avisos en vivo: solo quien administra el negocio" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select private.watch_topic((select realtime.topic()))));

-- Avisa al canal del negocio de la sucursal. Si el aviso falla, la venta o el gasto se guardan igual.
create function private.broadcast_till() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_branch uuid := coalesce(new.branch_id, old.branch_id);
  v_business uuid;
begin
  select br.business_id into v_business from public.branches br where br.id = v_branch;
  if v_business is not null then
    begin
      perform realtime.send(jsonb_build_object('branch', v_branch, 'op', lower(tg_op)), tg_table_name, 'negocio:' || v_business, true);
    exception when others then
      raise warning 'broadcast_till: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke execute on function private.broadcast_till() from public, anon, authenticated;

create trigger sales_broadcast after insert or update or delete on public.sales
  for each row execute function private.broadcast_till();
create trigger expenses_broadcast after insert or update or delete on public.expenses
  for each row execute function private.broadcast_till();
create trigger shift_closes_broadcast after insert or update of status on public.shift_closes
  for each row execute function private.broadcast_till();
