-- Keep the private bucket allowlist aligned with the MIME labels accepted by
-- the application. The server canonicalizes CSV and XLSX uploads, while this
-- broader allowlist remains compatible with Windows browser labels.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'raw-imports',
  'raw-imports',
  false,
  10485760,
  array[
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Recreate the policies idempotently in case the bucket row was created
-- manually but the initial policy statements were not applied.
drop policy if exists raw_import_owner_insert on storage.objects;
create policy raw_import_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'raw-imports'
  and public.is_authorized_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists raw_import_authorized_read on storage.objects;
create policy raw_import_authorized_read on storage.objects for select to authenticated
using (bucket_id = 'raw-imports' and public.is_authorized_user());

drop policy if exists raw_import_owner_delete on storage.objects;
create policy raw_import_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'raw-imports'
  and public.is_authorized_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);
