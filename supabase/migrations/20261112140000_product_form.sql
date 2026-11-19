-- Página de producto ajustable por negocio (/app/[negocio]/catalogo/nuevo y /[producto]):
--   businesses.product_form: cómo se arma el formulario de producto en ese negocio.
--     { "defaultMode": "stock"|"open"|"free", "hidden": ["photo","barcode","description","extra"],
--       "fields": [{ "id": "talla", "label": "Talla", "kind": "text"|"number"|"select", "options": ["S","M"] }] }
--   products.attributes: los valores de esos campos propios, { "<id del campo>": "valor" }.
-- La forma la valida la Action (zod); la base solo pone un tope de tamaño. Para todos los planes.

alter table public.businesses
  add column product_form jsonb not null default '{}'::jsonb
  check (jsonb_typeof(product_form) = 'object' and pg_column_size(product_form) < 16384);

alter table public.products
  add column attributes jsonb not null default '{}'::jsonb
  check (jsonb_typeof(attributes) = 'object' and pg_column_size(attributes) < 8192);

-- Se suma a los permisos por columna de la dueña sobre su negocio (las de products son de toda la tabla).
grant update (product_form) on public.businesses to authenticated;
