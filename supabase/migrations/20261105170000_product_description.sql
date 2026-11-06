-- Descripción del producto (opcional): se ve en el detalle del catálogo y la escribe la dueña al editarlo.
alter table public.products
  add column description text check (char_length(description) <= 500);
