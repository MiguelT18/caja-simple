-- Ayuda y comentarios (/app/ayuda): dudas, problemas y sugerencias que la persona nos envía.
-- Solo se escriben desde la app; se leen en el panel de Supabase o con SQL (ver docs/modelo-de-datos.md).

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  person_id uuid default auth.uid() references public.profiles (id) on delete set null,
  kind text not null check (kind in ('duda', 'problema', 'sugerencia')),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  -- La página desde la que escribió, para entender el contexto.
  page text check (char_length(page) <= 300),
  created_at timestamptz not null default now()
);
create index feedback_person_idx on public.feedback (person_id);
create index feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
create policy "Enviar tus comentarios" on public.feedback for insert to authenticated
  with check (person_id = (select auth.uid()));
create policy "Exige la verificación en dos pasos" on public.feedback as restrictive for all to authenticated
  using ((select private.mfa_ok())) with check ((select private.mfa_ok()));

-- La persona solo envía: no lee ni cambia mensajes (tampoco los suyos). El autor lo pone el default.
revoke all on public.feedback from anon, authenticated;
grant insert (kind, message, page) on public.feedback to authenticated;
