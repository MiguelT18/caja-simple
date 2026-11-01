-- Al crear un negocio, el INSERT … RETURNING necesita ver la fila nueva. private.is_member()
-- consulta con la foto del inicio de la sentencia y todavía no la ve: la dueña se compara directo.
drop policy "Ver tus negocios" on public.businesses;
create policy "Ver tus negocios" on public.businesses for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_member(id)));
