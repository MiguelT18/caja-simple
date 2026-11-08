-- La dueña puede eliminar los cobros de su plan que no se pagaron (por pagar o vencidos). Los pagados quedan.
create policy "La dueña elimina cobros sin pagar" on public.plan_charges for delete to authenticated
  using ((select private.is_owner(business_id)) and paid_at is null);
grant delete on public.plan_charges to authenticated;
