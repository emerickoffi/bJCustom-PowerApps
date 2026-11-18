-- Database catch-up, step C.
-- Applies two repo migrations that were never run on the live database:
--   20261231000010_selection_category_management.sql
--   20270101000010_project_photos.sql
-- Then re-applies the tenant-isolation rules (20270103 / 20270105) so the new table and policy
-- get the same protections as everything else. Safe to run once; every step is idempotent.

-- Company-wide selection category management: deactivate/reactivate and rename.
-- Additive only. Existing selections keep their category text; renaming or deactivating a
-- category never rewrites selection rows.

alter table public.selection_categories add column if not exists archived_at timestamptz;
alter table public.selection_categories add column if not exists updated_at timestamptz not null default now();

-- Only company admins may rename or (de)activate categories. Inserts stay limited to
-- managers (existing selection_categories_insert policy); reads stay limited to staff.
drop policy if exists selection_categories_update on public.selection_categories;
create policy selection_categories_update on public.selection_categories for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- organization_id must never move between companies on update.
create or replace function public.selection_categories_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'Category cannot move to another organization';
  end if;
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists selection_categories_guard on public.selection_categories;
create trigger selection_categories_guard before update on public.selection_categories
  for each row execute function public.selection_categories_guard();

-- Project Photos library: one authoritative record for photos uploaded directly to a project.
-- Photos from Daily Logs, Walkthroughs, Issues, and Client Updates are NOT copied here; the library reads them
-- in place through their own tables and RLS. Files stay in the private project-media bucket under
-- project-photos/{project_id}/{uuid}-{name}. Direct photos are internal only: there is no homeowner or
-- subcontractor branch anywhere in this file. Additive only: no drops, no deletes, no seeded data.

-- ============ FEATURE KEY ============
-- Same 19 keys as 20261211000010_project_rfis.sql plus project_photos.
create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
  values
    ('consultation',   true,  array[]::text[]),
    ('schedule',       true,  array[]::text[]),
    ('estimates',      true,  array[]::text[]),
    ('walkthroughs',   true,  array[]::text[]),
    ('issues',         true,  array[]::text[]),
    ('warranty',       true,  array[]::text[]),
    ('portal',         true,  array[]::text[]),
    ('documents',      false, array[]::text[]),
    ('e_signatures',   false, array['documents']),
    ('reports',        true,  array['walkthroughs']),
    ('invoices',       false, array[]::text[]),
    ('payments',       false, array['estimates']),
    ('quickbooks',     false, array['estimates']),
    ('ai_assistant',   false, array[]::text[]),
    ('daily_logs',     false, array[]::text[]),
    ('subcontractors', false, array[]::text[]),
    ('client_updates', false, array['portal']),
    ('change_orders',  false, array[]::text[]),
    ('rfis',           false, array[]::text[]),
    ('project_photos', false, array[]::text[])
$$;

-- ============ TABLE ============
create table if not exists public.project_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  storage_path text not null unique check (storage_path like 'project-photos/' || project_id::text || '/%'),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  caption text check (caption is null or char_length(caption) <= 300),
  location text check (location is null or char_length(location) <= 120),
  phase text check (phase is null or char_length(phase) <= 120),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete keeps the private object and the record for retention; nothing hard-deletes from the app.
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists project_photos_project_created_idx
  on public.project_photos (project_id, created_at desc) where deleted_at is null;
create index if not exists project_photos_org_idx on public.project_photos (organization_id);

-- Keeps organization_id consistent with the project so a crafted insert cannot cross companies.
create or replace function public.project_photos_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id is distinct from (select p.organization_id from public.projects p where p.id = new.project_id) then
    raise exception 'Photo organization does not match project';
  end if;
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id or new.storage_path <> old.storage_path or new.organization_id <> old.organization_id
       or new.uploaded_by is distinct from old.uploaded_by or new.created_at <> old.created_at then
      raise exception 'Photo file and ownership cannot be changed';
    end if;
    if old.deleted_at is not null then
      raise exception 'Deleted photos cannot be changed';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists project_photos_guard on public.project_photos;
create trigger project_photos_guard before insert or update on public.project_photos
  for each row execute function public.project_photos_guard();

alter table public.project_photos enable row level security;

drop policy if exists project_photos_select on public.project_photos;
create policy project_photos_select on public.project_photos for select to authenticated
  using (
    deleted_at is null
    and public.is_org_staff(organization_id)
    and public.can_view_project_internal(project_id)
    and public.is_feature_enabled(organization_id, 'project_photos')
  );

drop policy if exists project_photos_insert on public.project_photos;
create policy project_photos_insert on public.project_photos for insert to authenticated
  with check (
    deleted_at is null
    and uploaded_by = auth.uid()
    and public.is_org_staff(organization_id)
    and public.can_view_project_internal(project_id)
    and public.is_feature_enabled(organization_id, 'project_photos')
  );

drop policy if exists project_photos_update on public.project_photos;
create policy project_photos_update on public.project_photos for update to authenticated
  using (
    deleted_at is null
    and public.is_org_staff(organization_id)
    and public.can_view_project_internal(project_id)
    and public.is_feature_enabled(organization_id, 'project_photos')
  )
  with check (
    public.is_org_staff(organization_id)
    and public.can_view_project_internal(project_id)
    and public.is_feature_enabled(organization_id, 'project_photos')
  );
-- No delete policy: removal is a soft delete through update.

-- ============ STORAGE PATH CHECKS ============
-- Re-created from 20261206000010_field_issues.sql with every existing branch unchanged; only project-photos is new.
create or replace function public.can_view_media_path(p_path text)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w where w.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(w.project_id)
          or (public.is_project_homeowner(w.project_id) and (w.conducted_by = 'homeowner' or w.status = 'submitted')))
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(pi.project_id)
          or (pi.walkthrough_id is not null and public.is_project_homeowner(pi.project_id)))
    )
    when 'covers' then
      coalesce(public.is_org_manager(public.media_path_uuid(p_path, 2)), false)
      or exists (
        select 1 from public.projects p where p.cover_image_path = p_path
          and (public.can_view_project_internal(p.id) or public.is_project_homeowner(p.id))
      )
    when 'daily-logs' then exists (
      select 1 from public.daily_logs l where l.id = public.media_path_uuid(p_path, 2)
        and public.is_org_staff(l.organization_id)
        and public.can_view_project_internal(l.project_id)
        and public.is_feature_enabled(l.organization_id, 'daily_logs')
    )
    when 'project-photos' then exists (
      select 1 from public.project_photos ph where ph.storage_path = p_path
        and ph.deleted_at is null
        and public.is_org_staff(ph.organization_id)
        and public.can_view_project_internal(ph.project_id)
        and public.is_feature_enabled(ph.organization_id, 'project_photos')
    )
    else false
  end;
$$;

create or replace function public.can_upload_media_path(p_path text)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w
      join public.walkthrough_items i on i.walkthrough_id = w.id and i.id = public.media_path_uuid(p_path, 3)
      where w.id = public.media_path_uuid(p_path, 2)
        and w.status <> 'submitted'
        and (public.is_homeowner_walkthrough(w.id) or public.is_walkthrough_lead(w.id))
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and pi.status <> 'closed'
        and (public.can_view_project_internal(pi.project_id)
          or (split_part(p_path, '/', 3) = 'feedback'
              and pi.walkthrough_id is not null
              and public.is_project_homeowner(pi.project_id)
              and public.portal_contact_can(pi.project_id, 'validate_issues')))
    )
    when 'covers' then coalesce(public.is_org_manager(public.media_path_uuid(p_path, 2)), false)
    when 'daily-logs' then exists (
      select 1 from public.daily_logs l where l.id = public.media_path_uuid(p_path, 2)
        and l.status = 'draft'
        and public.is_org_staff(l.organization_id)
        and public.can_view_project_internal(l.project_id)
        and public.is_feature_enabled(l.organization_id, 'daily_logs')
    )
    when 'project-photos' then exists (
      select 1 from public.projects p where p.id = public.media_path_uuid(p_path, 2)
        and p.archived_at is null
        and public.is_org_staff(p.organization_id)
        and public.can_view_project_internal(p.id)
        and public.is_feature_enabled(p.organization_id, 'project_photos')
    )
    else false
  end;
$$;

-- ═════════ Re-apply tenant isolation (from 20270103 and 20270105) ═════════
-- ───────── 1. Organization must match the project's organization ─────────

-- Stop before changing anything if existing data already breaks the rule.
do $$
declare
  t record;
  n bigint;
  bad text := '';
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
    where c.table_schema = 'public' and c.column_name = 'project_id'
      and exists (select 1 from information_schema.columns o
                  where o.table_schema = 'public' and o.table_name = c.table_name and o.column_name = 'organization_id')
  loop
    execute format(
      'select count(*) from public.%I c join public.projects p on p.id = c.project_id where c.organization_id <> p.organization_id',
      t.table_name) into n;
    if n > 0 then bad := bad || format('%s (%s rows) ', t.table_name, n); end if;
  end loop;
  if bad <> '' then
    raise exception 'Rows whose organization differs from their project''s organization: %', bad;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_id_organization_id_key'
                 and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_id_organization_id_key unique (id, organization_id);
  end if;
end $$;

-- Add the composite key next to each existing project_id foreign key, with the same delete behaviour.
do $$
declare
  f record;
  cname text;
  on_delete text;
begin
  for f in
    select c.conrelid::regclass as tbl, k.relname as table_name, c.confdeltype as del
    from pg_constraint c
    join pg_class k on k.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.projects'::regclass
      and k.relnamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and a.attname = 'project_id'
      and exists (select 1 from pg_attribute o
                  where o.attrelid = c.conrelid and o.attname = 'organization_id' and not o.attisdropped)
  loop
    cname := left(f.table_name, 46) || '_project_org_fkey';
    continue when exists (select 1 from pg_constraint where conname = cname and conrelid = f.tbl);
    on_delete := case f.del
      when 'c' then 'on delete cascade'
      when 'r' then 'on delete restrict'
      when 'n' then 'on delete set null (project_id)'
      when 'd' then 'on delete set default (project_id)'
      else 'on delete no action'
    end;
    execute format(
      'alter table %s add constraint %I foreign key (project_id, organization_id) references public.projects (id, organization_id) %s not valid',
      f.tbl, cname, on_delete);
    execute format('alter table %s validate constraint %I', f.tbl, cname);
  end loop;
end $$;


-- The composite (project_id, organization_id) keys added in tenant_isolation_hardening fully cover the
-- old single-column project_id keys (same delete behaviour, and they also check the project exists).
-- Keeping both gave PostgREST two relationships to projects, so embeds like projects(...) failed
-- with PGRST201. Drop the old single-column key wherever the composite key exists.
do $$
declare f record;
begin
  for f in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_class k on k.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.projects'::regclass
      and k.relnamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and a.attname = 'project_id'
      and exists (select 1 from pg_constraint x
                  where x.conrelid = c.conrelid and x.contype = 'f'
                    and x.confrelid = 'public.projects'::regclass
                    and x.conname = left(k.relname, 46) || '_project_org_fkey'
                    and x.convalidated)
  loop
    execute format('alter table %s drop constraint %I', f.tbl, f.conname);
  end loop;
end $$;



-- ───────── 3. Policies apply to signed-in users only ─────────

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and roles = array['public']::name[]
  loop
    execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';
