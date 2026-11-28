-- La empleada vuelve a anotar pendientes sueltos en la sucursal donde trabaja (gastos fijos, solo la dueña).
-- Corregir monto y vencimiento sigue siendo de la dueña (on_pending_update); cancelar, también de quien lo anotó.
drop policy "La dueña anota pendientes" on public.pending_expenses;
create policy "Anotar pendientes: la dueña o quien trabaja ahí" on public.pending_expenses for insert to authenticated
  with check (
    ((select private.owns_branch(branch_id)) or (select private.works_in_branch(branch_id)))
    and created_by = (select auth.uid())
    and fixed_expense_id is null
  );
