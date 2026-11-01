-- Si una persona borra su cuenta, sus ventas, gastos y cierres se quedan en la caja del negocio:
-- solo se pierde quién los registró.
alter table public.sales alter column recorded_by drop not null,
  drop constraint sales_recorded_by_fkey,
  add constraint sales_recorded_by_fkey foreign key (recorded_by) references public.profiles (id) on delete set null;
alter table public.expenses alter column recorded_by drop not null,
  drop constraint expenses_recorded_by_fkey,
  add constraint expenses_recorded_by_fkey foreign key (recorded_by) references public.profiles (id) on delete set null;
alter table public.shift_closes alter column opened_by drop not null,
  drop constraint shift_closes_opened_by_fkey,
  add constraint shift_closes_opened_by_fkey foreign key (opened_by) references public.profiles (id) on delete set null;
