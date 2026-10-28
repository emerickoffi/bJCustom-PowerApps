-- Company Library: organization-scoped documents with no project.
-- Reuses project_documents / project_document_versions and the private project-documents bucket.
-- Company documents live under company/{org}/{document}/{version}.{ext}, are always internal,
-- and are limited to org managers (org_admin, project_manager). Homeowners never match.

alter table public.project_documents add column if not exists scope text not null default 'project';
alter table public.project_documents alter column project_id drop not null;
alter table public.project_document_versions alter column project_id drop not null;

alter table public.project_documents drop constraint if exists project_documents_category_check;
alter table public.project_documents add constraint project_documents_scope_check check (
  (scope = 'project' and project_id is not null
     and category in ('floor_plans','engineering','permits','contracts','estimates','change_orders','construction_reports','photos','warranty','other'))
  or
  (scope = 'company' and project_id is null and visibility = 'internal'
     and category in ('licenses','insurance','contract_templates','safety','internal_forms','vendor_reference','training','other'))
);

create index if not exists project_documents_company_idx
  on public.project_documents (organization_id, updated_at desc) where scope = 'company';

-- Staff-side access to one document, whatever its scope.
create or replace function public.can_view_document_internal(p_org uuid, p_scope text, p_project uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select case
    when p_scope = 'company' then p_project is null and public.is_org_manager(p_org)
    else p_project is not null and public.can_view_project_internal(p_project)
  end;
$$;

drop policy if exists project_documents_select on public.project_documents;
create policy project_documents_select on public.project_documents for select using (
  public.is_feature_enabled(organization_id, 'documents') and (
    public.can_view_document_internal(organization_id, scope, project_id)
    or (scope = 'project' and visibility = 'homeowner' and archived_at is null
        and public.is_project_homeowner(project_id) and public.portal_contact_can(project_id, 'view_reports'))
  )
);

create or replace function public.can_view_document_version(p_version uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.project_document_versions v
    join public.project_documents d on d.id = v.document_id
    where v.id = p_version
      and public.is_feature_enabled(d.organization_id, 'documents')
      and (
        public.can_view_document_internal(d.organization_id, d.scope, d.project_id)
        or (d.scope = 'project' and d.visibility = 'homeowner' and d.archived_at is null and d.current_version_id = v.id
            and public.is_project_homeowner(d.project_id)
            and public.portal_contact_can(d.project_id, 'view_reports'))
      )
  );
$$;

create or replace function public.can_read_document_object(p_name text)
returns boolean language sql stable security definer set search_path to '' as $$
  select split_part(p_name, '/', 1) in ('library', 'company') and exists (
    select 1 from public.project_document_versions v
    where v.storage_path = p_name and public.can_view_document_version(v.id)
  );
$$;

create or replace function public.can_upload_document_object(p_name text)
returns boolean language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid; v_project uuid; v_doc uuid; v_file text;
begin
  if auth.uid() is null or p_name is null then return false; end if;

  if split_part(p_name, '/', 1) = 'library' then
    if array_length(string_to_array(p_name, '/'), 1) <> 5 then return false; end if;
    v_org := public.media_path_uuid(p_name, 2);
    v_project := public.media_path_uuid(p_name, 3);
    v_doc := public.media_path_uuid(p_name, 4);
    v_file := split_part(p_name, '/', 5);
    if v_org is null or v_project is null or v_doc is null then return false; end if;
    if v_file !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp)$' then return false; end if;
    if not exists (select 1 from public.projects p where p.id = v_project and p.organization_id = v_org and p.archived_at is null) then return false; end if;
    if not public.is_feature_enabled(v_org, 'documents') or not public.can_view_project_internal(v_project) then return false; end if;
    if exists (select 1 from public.project_documents d where d.id = v_doc
               and (d.scope <> 'project' or d.project_id is distinct from v_project or d.organization_id <> v_org or d.archived_at is not null)) then
      return false;
    end if;
    return true;
  end if;

  if split_part(p_name, '/', 1) = 'company' then
    if array_length(string_to_array(p_name, '/'), 1) <> 4 then return false; end if;
    v_org := public.media_path_uuid(p_name, 2);
    v_doc := public.media_path_uuid(p_name, 3);
    v_file := split_part(p_name, '/', 4);
    if v_org is null or v_doc is null then return false; end if;
    if v_file !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp)$' then return false; end if;
    if not public.is_feature_enabled(v_org, 'documents') or not public.is_org_manager(v_org) then return false; end if;
    if exists (select 1 from public.project_documents d where d.id = v_doc
               and (d.scope <> 'company' or d.organization_id <> v_org or d.archived_at is not null)) then
      return false;
    end if;
    return true;
  end if;

  return false;
end $$;

drop policy if exists project_documents_library_delete on storage.objects;
create policy project_documents_library_delete on storage.objects for delete using (
  bucket_id = 'project-documents'
  and split_part(name, '/', 1) in ('library', 'company')
  and owner_id = (auth.uid())::text
  and public.document_object_unreferenced(name)
);

create or replace function public.project_documents_guard()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Documents cannot be deleted; archive them instead'; end if;
  if new.organization_id is distinct from old.organization_id or new.project_id is distinct from old.project_id
     or new.scope is distinct from old.scope
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'A document cannot be moved to another project, library, or organization';
  end if;
  return new;
end $$;

create or replace function public.register_company_document_version(
  p_storage_path text, p_original_filename text, p_name text default null, p_category text default null,
  p_description text default null, p_revision_notes text default null)
returns json language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_doc uuid; v_version uuid; v_ext text; v_size bigint; v_mime text; v_expected text;
  v_number int; v_existing record; v_doc_row record;
begin
  if split_part(p_storage_path, '/', 1) <> 'company' or not public.can_upload_document_object(p_storage_path) then
    raise exception 'You do not have permission to upload company documents';
  end if;
  v_org := public.media_path_uuid(p_storage_path, 2);
  v_doc := public.media_path_uuid(p_storage_path, 3);
  v_version := split_part(split_part(p_storage_path, '/', 4), '.', 1)::uuid;
  v_ext := split_part(split_part(p_storage_path, '/', 4), '.', 2);
  v_expected := case v_ext when 'pdf' then 'application/pdf' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' end;

  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_mime, v_size
    from storage.objects o
   where o.bucket_id = 'project-documents' and o.name = p_storage_path and o.owner_id = (auth.uid())::text;
  if not found then raise exception 'The uploaded file could not be found. Please upload it again.'; end if;
  if v_size is null or v_size <= 0 then raise exception 'The uploaded file is empty.'; end if;
  if v_size > 26214400 then raise exception 'Files must be 25 MB or smaller.'; end if;
  if v_mime is distinct from v_expected then raise exception 'The file type does not match its contents. Upload a PDF, PNG, JPEG, or WebP file.'; end if;
  if p_original_filename is null or char_length(btrim(p_original_filename)) = 0 then raise exception 'The original file name is missing.'; end if;

  insert into public.project_documents (id, organization_id, project_id, scope, name, description, category, visibility, created_by, updated_by)
  select v_doc, v_org, null, 'company', btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_category,
         'internal', auth.uid(), auth.uid()
   where not exists (select 1 from public.project_documents d where d.id = v_doc) and p_name is not null
  on conflict (id) do nothing;

  select * into v_doc_row from public.project_documents d where d.id = v_doc for update;
  if not found then raise exception 'Enter a document name and category.'; end if;
  if v_doc_row.scope <> 'company' or v_doc_row.organization_id <> v_org then raise exception 'Document not found'; end if;
  if v_doc_row.archived_at is not null then raise exception 'Restore this document before uploading a new version.'; end if;

  select v.id, v.version_number into v_existing from public.project_document_versions v where v.storage_path = p_storage_path;
  if found then
    return json_build_object('document_id', v_doc, 'version_id', v_existing.id, 'version_number', v_existing.version_number, 'duplicate', true);
  end if;

  v_number := v_doc_row.current_version_number + 1;
  insert into public.project_document_versions (id, document_id, organization_id, project_id, version_number, storage_path,
                                                original_filename, content_type, size_bytes, revision_notes, uploaded_by)
  values (v_version, v_doc, v_org, null, v_number, p_storage_path, left(btrim(p_original_filename), 255), v_mime, v_size,
          nullif(left(btrim(coalesce(p_revision_notes, '')), 1000), ''), auth.uid());

  update public.project_documents
     set current_version_id = v_version, current_version_number = v_number, updated_by = auth.uid()
   where id = v_doc;

  return json_build_object('document_id', v_doc, 'version_id', v_version, 'version_number', v_number, 'duplicate', false);
end $$;

revoke all on function public.register_company_document_version(text, text, text, text, text, text) from public, anon;
grant execute on function public.register_company_document_version(text, text, text, text, text, text) to authenticated;

-- The project RPC must never attach a version to a company document.
create or replace function public.register_project_document_version(p_storage_path text, p_original_filename text, p_name text default null, p_category text default null, p_description text default null, p_visibility text default 'internal', p_revision_notes text default null)
returns json language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid; v_project uuid; v_doc uuid; v_version uuid; v_ext text;
  v_size bigint; v_mime text; v_expected text; v_number int; v_existing record; v_doc_row record; v_created boolean := false;
begin
  if split_part(p_storage_path, '/', 1) <> 'library' or not public.can_upload_document_object(p_storage_path) then
    raise exception 'You do not have permission to upload documents to this project';
  end if;
  v_org := public.media_path_uuid(p_storage_path, 2);
  v_project := public.media_path_uuid(p_storage_path, 3);
  v_doc := public.media_path_uuid(p_storage_path, 4);
  v_version := split_part(split_part(p_storage_path, '/', 5), '.', 1)::uuid;
  v_ext := split_part(split_part(p_storage_path, '/', 5), '.', 2);
  v_expected := case v_ext when 'pdf' then 'application/pdf' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' end;

  select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as size into v_mime, v_size
    from storage.objects o
   where o.bucket_id = 'project-documents' and o.name = p_storage_path and o.owner_id = (auth.uid())::text;
  if not found then raise exception 'The uploaded file could not be found. Please upload it again.'; end if;
  if v_size is null or v_size <= 0 then raise exception 'The uploaded file is empty.'; end if;
  if v_size > 26214400 then raise exception 'Files must be 25 MB or smaller.'; end if;
  if v_mime is distinct from v_expected then raise exception 'The file type does not match its contents. Upload a PDF, PNG, JPEG, or WebP file.'; end if;
  if p_original_filename is null or char_length(btrim(p_original_filename)) = 0 then raise exception 'The original file name is missing.'; end if;

  insert into public.project_documents (id, organization_id, project_id, scope, name, description, category, visibility, created_by, updated_by)
  select v_doc, v_org, v_project, 'project', btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_category,
         coalesce(p_visibility, 'internal'), auth.uid(), auth.uid()
   where not exists (select 1 from public.project_documents d where d.id = v_doc)
     and p_name is not null
  on conflict (id) do nothing;
  get diagnostics v_number = row_count;
  v_created := v_number > 0;

  select * into v_doc_row from public.project_documents d where d.id = v_doc for update;
  if not found then raise exception 'Enter a document name and category.'; end if;
  if v_doc_row.scope <> 'project' or v_doc_row.project_id is distinct from v_project then raise exception 'Document not found'; end if;
  if v_doc_row.archived_at is not null then raise exception 'Restore this document before uploading a new version.'; end if;
  if v_created and v_doc_row.visibility = 'homeowner' and not public.is_org_manager(v_org) then
    raise exception 'Only administrators and project managers can share documents with homeowners.';
  end if;

  select v.id, v.version_number into v_existing from public.project_document_versions v where v.storage_path = p_storage_path;
  if found then
    return json_build_object('document_id', v_doc, 'version_id', v_existing.id, 'version_number', v_existing.version_number, 'duplicate', true);
  end if;

  v_number := v_doc_row.current_version_number + 1;
  insert into public.project_document_versions (id, document_id, organization_id, project_id, version_number, storage_path,
                                                original_filename, content_type, size_bytes, revision_notes, uploaded_by)
  values (v_version, v_doc, v_org, v_project, v_number, p_storage_path, left(btrim(p_original_filename), 255), v_mime, v_size,
          nullif(left(btrim(coalesce(p_revision_notes, '')), 1000), ''), auth.uid());

  update public.project_documents
     set current_version_id = v_version, current_version_number = v_number, updated_by = auth.uid()
   where id = v_doc;

  return json_build_object('document_id', v_doc, 'version_id', v_version, 'version_number', v_number, 'duplicate', false);
end $$;

create or replace function public.update_project_document_details(p_document uuid, p_name text, p_category text, p_description text)
returns void language plpgsql security definer set search_path to '' as $$
declare d record;
begin
  select * into d from public.project_documents where id = p_document for update;
  if not found or not public.is_feature_enabled(d.organization_id, 'documents')
     or not public.can_view_document_internal(d.organization_id, d.scope, d.project_id) then
    raise exception 'Document not found';
  end if;
  if d.archived_at is not null then raise exception 'Restore this document before editing it.'; end if;
  update public.project_documents
     set name = btrim(p_name), category = p_category, description = nullif(btrim(coalesce(p_description, '')), ''), updated_by = auth.uid()
   where id = p_document;
end $$;

create or replace function public.set_project_document_visibility(p_document uuid, p_visibility text)
returns void language plpgsql security definer set search_path to '' as $$
declare d record;
begin
  select * into d from public.project_documents where id = p_document for update;
  if not found or not public.is_feature_enabled(d.organization_id, 'documents')
     or not public.can_view_document_internal(d.organization_id, d.scope, d.project_id) then
    raise exception 'Document not found';
  end if;
  if d.scope = 'company' then raise exception 'Company Library documents stay internal and cannot be shared.'; end if;
  if not public.is_org_manager(d.organization_id) then
    raise exception 'Only administrators and project managers can change document sharing.';
  end if;
  if p_visibility not in ('internal', 'homeowner') then raise exception 'Unknown visibility'; end if;
  if d.archived_at is not null and p_visibility = 'homeowner' then raise exception 'Restore this document before sharing it.'; end if;
  update public.project_documents set visibility = p_visibility, updated_by = auth.uid() where id = p_document;
end $$;

create or replace function public.set_project_document_archived(p_document uuid, p_archived boolean)
returns void language plpgsql security definer set search_path to '' as $$
declare d record;
begin
  select * into d from public.project_documents where id = p_document for update;
  if not found or not public.is_feature_enabled(d.organization_id, 'documents')
     or not public.can_view_document_internal(d.organization_id, d.scope, d.project_id) then
    raise exception 'Document not found';
  end if;
  if not public.is_org_manager(d.organization_id) then
    raise exception 'Only administrators and project managers can archive documents.';
  end if;
  update public.project_documents
     set archived_at = case when p_archived then coalesce(d.archived_at, now()) end,
         archived_by = case when p_archived then auth.uid() end,
         visibility = case when p_archived then 'internal' else visibility end,
         updated_by = auth.uid()
   where id = p_document;
end $$;
