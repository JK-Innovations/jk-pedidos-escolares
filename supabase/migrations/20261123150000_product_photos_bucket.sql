-- Fotos de prendas en Storage. Ejecutar completo en el SQL Editor de Supabase
-- (proyecto oavhgokdtohrwifjjiqs). NO está aplicado todavía: aplicarlo necesita el visto bueno de Kleyi.
-- No toca tablas, pedidos, products.photo, las fotos de Harder en assets/img ni el formulario público.
-- Se puede volver a ejecutar: el bucket se actualiza y las políticas se reemplazan.
-- Igual que school-logos: lectura pública; subir, reemplazar y borrar solo si public.is_admin().

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-photos',
  'product-photos',
  true,
  3145728,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_photos_public_read on storage.objects;
create policy product_photos_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'product-photos');

drop policy if exists product_photos_admin_insert on storage.objects;
create policy product_photos_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-photos' and public.is_admin());

drop policy if exists product_photos_admin_update on storage.objects;
create policy product_photos_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-photos' and public.is_admin())
  with check (bucket_id = 'product-photos' and public.is_admin());

drop policy if exists product_photos_admin_delete on storage.objects;
create policy product_photos_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-photos' and public.is_admin());

commit;
