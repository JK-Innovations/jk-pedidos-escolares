-- Logos de escuelas en Storage. Ejecutar completo en el SQL Editor de Supabase
-- (proyecto oavhgokdtohrwifjjiqs). No está aplicado todavía.
-- No toca schools.logo_path, ni el archivo assets/img/school-harder.png, ni el formulario público.
-- Se puede volver a ejecutar: el bucket se actualiza y las políticas se reemplazan.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-logos',
  'school-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Lectura pública del bucket. Subir, reemplazar y borrar solo si public.is_admin().
-- Upsert necesita select + insert + update; el select público cubre también al admin.
drop policy if exists school_logos_public_read on storage.objects;
create policy school_logos_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'school-logos');

drop policy if exists school_logos_admin_insert on storage.objects;
create policy school_logos_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'school-logos' and public.is_admin());

drop policy if exists school_logos_admin_update on storage.objects;
create policy school_logos_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'school-logos' and public.is_admin())
  with check (bucket_id = 'school-logos' and public.is_admin());

drop policy if exists school_logos_admin_delete on storage.objects;
create policy school_logos_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'school-logos' and public.is_admin());

commit;
