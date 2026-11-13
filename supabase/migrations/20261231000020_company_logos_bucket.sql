-- Company logo storage. Additive and idempotent: no table changes; organizations.logo_url keeps
-- holding the single active logo (an uploaded file's public URL or a hosted URL).
--
-- Logos are public-read because they render on the homeowner portal, printed documents, and
-- proposals. Objects live at <organization_id>/logo; only that organization's admins can write.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists company_logos_select on storage.objects;
create policy company_logos_select on storage.objects for select to authenticated
  using (bucket_id = 'company-logos' and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false));

drop policy if exists company_logos_insert on storage.objects;
create policy company_logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and split_part(name, '/', 2) = 'logo'
    and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false)
  );

drop policy if exists company_logos_update on storage.objects;
create policy company_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'company-logos' and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false))
  with check (
    bucket_id = 'company-logos'
    and split_part(name, '/', 2) = 'logo'
    and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false)
  );

drop policy if exists company_logos_delete on storage.objects;
create policy company_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos' and coalesce(public.is_org_admin(public.media_path_uuid(name, 1)), false));
