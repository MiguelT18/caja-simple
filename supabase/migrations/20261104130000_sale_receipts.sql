-- Comprobante de pago de las ventas por QR o transferencia: la captura que sube quien cobra.
-- Se pide al cobrar con conexión; una venta que se envió desde la cola (sin conexión) queda «sin comprobante»
-- y se adjunta después desde Ventas. La base no lo exige: la venta ya ocurrió y no se pierde por la foto.

alter table public.sales add column receipt_path text;

-- La vista suma la columna al final (create or replace solo deja agregar columnas al final).
create or replace view public.sale_totals with (security_invoker = true) as
select s.id as sale_id, s.branch_id, s.shift_id, s.business_date, s.occurred_at, s.recorded_by,
       sum(i.qty * i.unit_price) as total, sum(i.qty)::integer as items, s.payment_method, s.voided_at,
       s.receipt_path
from public.sales s
join public.sale_items i on i.sale_id = s.id
group by s.id;

-- Bucket privado: <negocio>/<venta>/<archivo>. Lo ven y lo suben las personas del negocio; no se reemplaza
-- (no hay update) y solo la dueña borra. La política restrictiva de la verificación en dos pasos ya cubre
-- todo storage.objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sale-receipts', 'sale-receipts', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Ver comprobantes del negocio" on storage.objects for select to authenticated
  using (bucket_id = 'sale-receipts' and (select private.is_member(private.folder_business(name))));
create policy "Subir comprobantes del negocio" on storage.objects for insert to authenticated
  with check (bucket_id = 'sale-receipts' and (select private.is_member(private.folder_business(name))));
create policy "La dueña borra comprobantes" on storage.objects for delete to authenticated
  using (bucket_id = 'sale-receipts' and (select private.is_owner(private.folder_business(name))));

-- Adjuntar: quien registró la venta (una vez) o la dueña (también lo reemplaza). El archivo tiene que estar ya
-- subido en la carpeta de esa venta.
create function private.attach_sale_receipt(p_sale uuid, p_path text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales;
  v_business uuid;
  v_owner boolean;
begin
  if not private.mfa_ok() then
    raise exception 'Escribe el código de tu app de autenticación para seguir.' using errcode = '42501';
  end if;
  select * into v_sale from public.sales s where s.id = p_sale for update;
  if v_sale.id is null or not private.can_use_branch(v_sale.branch_id) then
    raise exception 'Esa venta ya no existe.' using errcode = 'P0001';
  end if;
  v_owner := private.owns_branch(v_sale.branch_id);
  if not v_owner and v_sale.recorded_by is distinct from (select auth.uid()) then
    raise exception 'Solo quien registró la venta o la dueña pueden adjuntar su comprobante.' using errcode = '42501';
  end if;
  if not v_owner and v_sale.receipt_path is not null then
    raise exception 'Esta venta ya tiene comprobante.' using errcode = 'P0001';
  end if;
  select b.business_id into v_business from public.branches b where b.id = v_sale.branch_id;
  if split_part(p_path, '/', 1) <> v_business::text or split_part(p_path, '/', 2) <> p_sale::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'sale-receipts' and o.name = p_path) then
    raise exception 'No encontramos la imagen del comprobante. Súbela de nuevo.' using errcode = 'P0001';
  end if;

  update public.sales set receipt_path = p_path where id = p_sale;
end;
$$;

create function public.attach_sale_receipt(p_sale uuid, p_path text) returns void
language sql security invoker set search_path = ''
as $$ select private.attach_sale_receipt(p_sale, p_path) $$;

revoke execute on function private.attach_sale_receipt(uuid, text), public.attach_sale_receipt(uuid, text) from public, anon;
grant execute on function private.attach_sale_receipt(uuid, text), public.attach_sale_receipt(uuid, text) to authenticated;
