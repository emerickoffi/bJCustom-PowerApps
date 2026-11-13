-- Company logo storage, hardened. Supersedes the bucket settings and policies from
-- 20261231000020_company_logos_bucket.sql and is safe to run whether or not that migration ran.
-- Additive and idempotent: no table or row changes; organizations.logo_url is untouched.
--
-- The bucket is private. A public bucket serves every object to anyone holding its URL and bypasses
-- the select policy entirely. Uploaded logos are delivered only through the app's /api/company-logo
-- route, which reads with the signed-in user's own session, so this select policy is what limits a
-- user to their own company's logo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Any member of the company (staff or homeowner) may read that company's logo; nobody else may.
drop policy if exists company_logos_select on storage.objects;
create policy company_logos_select on storage.objects for select to authenticated
  using (bucket_id = 'company-logos' and coalesce(public.is_org_member(public.media_path_uuid(name, 1)), false));

-- Writes are limited to company admins and to the single object <organization_id>/logo, so a nested
-- path such as <organization_id>/logo/extra cannot be created.
drop policy if exists company_logos_insert on storage.objects;
create policy company_logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and public.media_path_uuid(name, 1) is not null
    and name = public.media_path_uuid(name, 1)::text || '/logo'
    and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false)
  );

drop policy if exists company_logos_update on storage.objects;
create policy company_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'company-logos' and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false))
  with check (
    bucket_id = 'company-logos'
    and public.media_path_uuid(name, 1) is not null
    and name = public.media_path_uuid(name, 1)::text || '/logo'
    and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false)
  );

drop policy if exists company_logos_delete on storage.objects;
create policy company_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos' and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false));
