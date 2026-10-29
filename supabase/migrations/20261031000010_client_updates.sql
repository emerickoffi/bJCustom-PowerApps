-- Client Updates: builder-authored progress reports published to homeowners. FOR REVIEW — not yet applied.
-- Additive only: five new tables, one publish function, guard/audit triggers, RLS policies, and the
-- 'client_updates' feature key. No existing table, function, or policy is altered (feature_registry() is
-- re-declared with the previous list plus one row).
--
-- Security model:
-- * client_updates / client_update_sources / client_update_photos are the builder's working draft. Only staff
--   with internal access to the project can read them; only org admins and project managers with that access
--   can write. Homeowners never read these tables, so unpublished edits can never leak.
-- * client_update_publications / client_update_publication_photos are immutable snapshots written only by
--   publish_client_update(). Homeowners read them through is_project_homeowner(), which already enforces
--   portal access, contact scoping, and the portal feature flag. No insert/update/delete policies exist.
-- * Photo rows reference existing media; storage_path is copied from the source row by trigger (never from
--   the client) and is not granted to authenticated on publication photos. The app resolves published images
--   server-side after an RLS-checked lookup, so homeowners never receive internal storage paths.
-- * Daily-log photos are only selectable from finalized logs on the same project. Publishing re-validates every
--   photo and source, so a deleted or reopened source drops out instead of being shared.
-- * Re-publishing creates a new revision; earlier revisions stay as history. Publishing is idempotent and
--   rejects stale versions, so duplicate clicks and concurrent edits cannot double-publish or publish unseen text.
-- * Publishing sends no email or SMS.
--
-- Apply after 20261030000010_subcontractor_assignments.sql.

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
    ('client_updates', false, array['portal'])
$$;

-- Working drafts ------------------------------------------------------------------------------------------

create table public.client_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  period_start date not null,
  period_end date not null,
  overview text check (char_length(overview) <= 4000),
  completed_work text check (char_length(completed_work) <= 4000),
  in_progress_work text check (char_length(in_progress_work) <= 4000),
  upcoming_work text check (char_length(upcoming_work) <= 4000),
  homeowner_message text check (char_length(homeowner_message) <= 4000),
  ai_assisted boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  version integer not null default 1,
  revision integer not null default 0,
  published_version integer,
  first_published_at timestamptz,
  last_published_at timestamptz,
  last_published_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start and period_end - period_start <= 62)
);
create index client_updates_project_idx on public.client_updates (project_id, updated_at desc);
create index client_updates_org_idx on public.client_updates (organization_id, status);

create table public.client_update_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_update_id uuid not null references public.client_updates(id) on delete cascade,
  source_type text not null check (source_type in ('daily_log', 'schedule_activity')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (client_update_id, source_type, source_id)
);

create table public.client_update_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_update_id uuid not null references public.client_updates(id) on delete cascade,
  source_type text not null check (source_type in ('daily_log_photo', 'issue_attachment')),
  source_id uuid not null,
  storage_path text not null,
  caption text check (char_length(caption) <= 300),
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  unique (client_update_id, source_type, source_id)
);
create unique index client_update_photos_one_cover on public.client_update_photos (client_update_id) where is_cover;

-- Immutable published snapshots ---------------------------------------------------------------------------

create table public.client_update_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  client_update_id uuid not null references public.client_updates(id) on delete restrict,
  revision integer not null,
  title text not null,
  period_start date not null,
  period_end date not null,
  overview text,
  completed_work text,
  in_progress_work text,
  upcoming_work text,
  homeowner_message text,
  author_name text,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (client_update_id, revision)
);
create index client_update_publications_project_idx on public.client_update_publications (project_id, published_at desc);

create table public.client_update_publication_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  publication_id uuid not null references public.client_update_publications(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);
create index client_update_publication_photos_pub_idx on public.client_update_publication_photos (publication_id, sort_order);

-- Guards --------------------------------------------------------------------------------------------------

create or replace function public.client_updates_guard()
returns trigger language plpgsql set search_path = '' as $$
declare v_publishing boolean := coalesce(current_setting('app.client_update_publish', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.version := 1; new.revision := 0; new.published_version := null;
    new.first_published_at := null; new.last_published_at := null; new.last_published_by := null;
    new.created_by := auth.uid(); new.updated_by := auth.uid();
    if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
      raise exception 'project_org_mismatch' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.organization_id <> old.organization_id or new.project_id <> old.project_id or new.created_by is distinct from old.created_by then
    raise exception 'immutable_fields' using errcode = '23514';
  end if;
  if not v_publishing and (new.status <> old.status or new.revision <> old.revision
      or new.published_version is distinct from old.published_version
      or new.first_published_at is distinct from old.first_published_at
      or new.last_published_at is distinct from old.last_published_at
      or new.last_published_by is distinct from old.last_published_by) then
    raise exception 'publish_fields_require_publish' using errcode = '42501';
  end if;
  if not v_publishing then
    new.version := old.version + 1;
    new.updated_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger client_updates_guard before insert or update on public.client_updates
  for each row execute function public.client_updates_guard();

-- Children: inherit org from the parent, verify sources belong to the same project, copy storage paths.
create or replace function public.client_update_child_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_org uuid; v_path text;
begin
  select u.project_id, u.organization_id into v_project, v_org from public.client_updates u where u.id = new.client_update_id;
  if v_project is null then raise exception 'update_not_found' using errcode = '23503'; end if;
  if tg_op = 'UPDATE' and (new.client_update_id <> old.client_update_id or new.source_id <> old.source_id or new.source_type <> old.source_type) then
    raise exception 'immutable_fields' using errcode = '23514';
  end if;
  new.organization_id := v_org;

  if tg_table_name = 'client_update_sources' then
    if new.source_type = 'daily_log' and not exists (
      select 1 from public.daily_logs l where l.id = new.source_id and l.project_id = v_project and l.status = 'finalized'
    ) then raise exception 'source_not_allowed' using errcode = '23514'; end if;
    if new.source_type = 'schedule_activity' and not exists (
      select 1 from public.schedule_activities a where a.id = new.source_id and a.project_id = v_project
    ) then raise exception 'source_not_allowed' using errcode = '23514'; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.source_type = 'daily_log_photo' then
      select p.storage_path into v_path from public.daily_log_photos p
        join public.daily_logs l on l.id = p.daily_log_id
        where p.id = new.source_id and l.project_id = v_project and l.status = 'finalized';
    else
      select a.storage_path into v_path from public.issue_attachments a
        join public.project_issues i on i.id = a.issue_id
        where a.id = new.source_id and i.project_id = v_project and a.mime_type like 'image/%';
    end if;
    if v_path is null then raise exception 'photo_not_allowed' using errcode = '23514'; end if;
    new.storage_path := v_path;
  else
    new.storage_path := old.storage_path;
  end if;
  return new;
end $$;

create trigger client_update_sources_guard before insert or update on public.client_update_sources
  for each row execute function public.client_update_child_guard();
create trigger client_update_photos_guard before insert or update on public.client_update_photos
  for each row execute function public.client_update_child_guard();

-- Any source or photo change counts as a draft edit (bumps version via the parent guard).
create or replace function public.client_update_touch_parent()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.client_updates set updated_at = now() where id = coalesce(new.client_update_id, old.client_update_id);
  return coalesce(new, old);
end $$;

create trigger client_update_sources_touch after insert or update or delete on public.client_update_sources
  for each row execute function public.client_update_touch_parent();
create trigger client_update_photos_touch after insert or update or delete on public.client_update_photos
  for each row execute function public.client_update_touch_parent();

create trigger audit_client_updates after insert or update or delete on public.client_updates
  for each row execute function public.write_audit_event();
create trigger audit_client_update_publications after insert on public.client_update_publications
  for each row execute function public.write_audit_event();

-- Publishing ----------------------------------------------------------------------------------------------

create or replace function public.publish_client_update(p_update uuid, p_expected_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare u public.client_updates; v_rev integer; v_pub uuid; v_name text;
begin
  select * into u from public.client_updates where id = p_update for update;
  if not found or not (public.is_org_manager(u.organization_id) and public.can_view_project_internal(u.project_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if not public.is_feature_enabled(u.organization_id, 'client_updates') then
    raise exception 'feature_disabled' using errcode = '42501';
  end if;
  if u.published_version = u.version then return u.revision; end if;
  if u.version <> p_expected_version then raise exception 'stale_version' using errcode = '40001'; end if;
  if coalesce(btrim(u.overview), '') = '' and coalesce(btrim(u.completed_work), '') = ''
     and coalesce(btrim(u.in_progress_work), '') = '' and coalesce(btrim(u.upcoming_work), '') = '' then
    raise exception 'empty_update' using errcode = '23514';
  end if;

  select nullif(btrim(full_name), '') into v_name from public.profiles where id = auth.uid();
  v_rev := u.revision + 1;

  insert into public.client_update_publications (
    organization_id, project_id, client_update_id, revision, title, period_start, period_end,
    overview, completed_work, in_progress_work, upcoming_work, homeowner_message, author_name, published_by
  ) values (
    u.organization_id, u.project_id, u.id, v_rev, u.title, u.period_start, u.period_end,
    nullif(btrim(u.overview), ''), nullif(btrim(u.completed_work), ''), nullif(btrim(u.in_progress_work), ''),
    nullif(btrim(u.upcoming_work), ''), nullif(btrim(u.homeowner_message), ''), v_name, auth.uid()
  ) returning id into v_pub;

  -- Re-validate every photo against its source at publish time.
  insert into public.client_update_publication_photos (organization_id, project_id, publication_id, storage_path, caption, sort_order, is_cover)
  select u.organization_id, u.project_id, v_pub, p.storage_path, nullif(btrim(p.caption), ''), p.sort_order, p.is_cover
  from public.client_update_photos p
  where p.client_update_id = u.id
    and (
      (p.source_type = 'daily_log_photo' and exists (
        select 1 from public.daily_log_photos d join public.daily_logs l on l.id = d.daily_log_id
        where d.id = p.source_id and d.storage_path = p.storage_path and l.project_id = u.project_id and l.status = 'finalized'))
      or (p.source_type = 'issue_attachment' and exists (
        select 1 from public.issue_attachments a join public.project_issues i on i.id = a.issue_id
        where a.id = p.source_id and a.storage_path = p.storage_path and i.project_id = u.project_id))
    );

  perform set_config('app.client_update_publish', 'on', true);
  update public.client_updates set
    status = 'published', revision = v_rev, published_version = u.version,
    first_published_at = coalesce(u.first_published_at, now()), last_published_at = now(), last_published_by = auth.uid()
  where id = u.id;
  perform set_config('app.client_update_publish', '', true);
  return v_rev;
end $$;

revoke all on function public.publish_client_update(uuid, integer) from public, anon;
grant execute on function public.publish_client_update(uuid, integer) to authenticated;

-- RLS -----------------------------------------------------------------------------------------------------

alter table public.client_updates enable row level security;
alter table public.client_update_sources enable row level security;
alter table public.client_update_photos enable row level security;
alter table public.client_update_publications enable row level security;
alter table public.client_update_publication_photos enable row level security;

revoke all on public.client_updates, public.client_update_sources, public.client_update_photos,
  public.client_update_publications, public.client_update_publication_photos from anon;

-- Feature gate (restrictive): nothing is readable or writable while the feature is off.
create policy client_updates_feature_gate on public.client_updates as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'client_updates'))
  with check (public.is_feature_enabled(organization_id, 'client_updates'));
create policy client_update_sources_feature_gate on public.client_update_sources as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'client_updates'))
  with check (public.is_feature_enabled(organization_id, 'client_updates'));
create policy client_update_photos_feature_gate on public.client_update_photos as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'client_updates'))
  with check (public.is_feature_enabled(organization_id, 'client_updates'));
create policy client_update_publications_feature_gate on public.client_update_publications as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'client_updates'));
create policy client_update_publication_photos_feature_gate on public.client_update_publication_photos as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'client_updates'));

create policy client_updates_select on public.client_updates for select to authenticated
  using (public.is_org_staff(organization_id) and public.can_view_project_internal(project_id));
create policy client_updates_insert on public.client_updates for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy client_updates_update on public.client_updates for update to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id))
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy client_updates_delete on public.client_updates for delete to authenticated
  using (revision = 0 and public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));

create policy client_update_sources_select on public.client_update_sources for select to authenticated
  using (exists (select 1 from public.client_updates u where u.id = client_update_id));
create policy client_update_sources_write on public.client_update_sources for all to authenticated
  using (exists (select 1 from public.client_updates u where u.id = client_update_id
    and public.is_org_manager(u.organization_id) and public.can_view_project_internal(u.project_id)))
  with check (exists (select 1 from public.client_updates u where u.id = client_update_id
    and public.is_org_manager(u.organization_id) and public.can_view_project_internal(u.project_id)));

create policy client_update_photos_select on public.client_update_photos for select to authenticated
  using (exists (select 1 from public.client_updates u where u.id = client_update_id));
create policy client_update_photos_write on public.client_update_photos for all to authenticated
  using (exists (select 1 from public.client_updates u where u.id = client_update_id
    and public.is_org_manager(u.organization_id) and public.can_view_project_internal(u.project_id)))
  with check (exists (select 1 from public.client_updates u where u.id = client_update_id
    and public.is_org_manager(u.organization_id) and public.can_view_project_internal(u.project_id)));

create policy client_update_publications_select on public.client_update_publications for select to authenticated
  using ((public.is_org_staff(organization_id) and public.can_view_project_internal(project_id)) or public.is_project_homeowner(project_id));
create policy client_update_publication_photos_select on public.client_update_publication_photos for select to authenticated
  using ((public.is_org_staff(organization_id) and public.can_view_project_internal(project_id)) or public.is_project_homeowner(project_id));

-- Snapshots are written only by publish_client_update(); storage paths stay server-side.
revoke insert, update, delete on public.client_update_publications, public.client_update_publication_photos from authenticated;
revoke select on public.client_update_publication_photos from authenticated;
grant select (id, organization_id, project_id, publication_id, caption, sort_order, is_cover, created_at)
  on public.client_update_publication_photos to authenticated;
