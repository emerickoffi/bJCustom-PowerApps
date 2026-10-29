-- Phase 7: Daily construction logs. FOR REVIEW — not yet applied.
-- Additive: four new tables, guard triggers, two RPCs, and a 'daily-logs/' branch in the existing
-- project-media storage path checks (functions are re-created with every existing branch unchanged).
--
-- Semantics:
-- * One log per project per calendar day (unique), so double submits cannot create duplicates.
-- * Lifecycle: draft -> finalized. Finalized logs, their crews, activity links and photos are immutable.
-- * Optimistic concurrency: every update bumps `version`; saves and finalization name the version they saw.
-- * Linking schedule activities stores references only. Nothing here writes to schedule_activities.
-- * Access: organization staff with internal access to the project (admins, project managers, and
--   Builder Staff assigned to that project). Homeowners have no policy and never see daily logs.
-- * Weather is manual-only; weather_source is constrained to 'manual' until a provider is approved.

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
  values
    ('consultation', true,  array[]::text[]),
    ('schedule',     true,  array[]::text[]),
    ('estimates',    true,  array[]::text[]),
    ('walkthroughs', true,  array[]::text[]),
    ('issues',       true,  array[]::text[]),
    ('warranty',     true,  array[]::text[]),
    ('portal',       true,  array[]::text[]),
    ('documents',    false, array[]::text[]),
    ('e_signatures', false, array['documents']),
    ('reports',      true,  array['walkthroughs']),
    ('invoices',     false, array[]::text[]),
    ('payments',     false, array['estimates']),
    ('quickbooks',   false, array['estimates']),
    ('ai_assistant', false, array[]::text[]),
    ('daily_logs',   false, array[]::text[])
$$;

create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  log_date date not null,
  author_id uuid references auth.users(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  version integer not null default 1 check (version > 0),
  weather_conditions text check (weather_conditions is null or char_length(weather_conditions) <= 200),
  temperature_f integer check (temperature_f is null or temperature_f between -60 and 140),
  weather_source text not null default 'manual' check (weather_source = 'manual'),
  weather_impact text check (weather_impact is null or char_length(weather_impact) <= 2000),
  site_conditions text check (site_conditions is null or char_length(site_conditions) <= 2000),
  work_performed text check (work_performed is null or char_length(work_performed) <= 8000),
  progress_notes text check (progress_notes is null or char_length(progress_notes) <= 4000),
  work_planned_next text check (work_planned_next is null or char_length(work_planned_next) <= 4000),
  materials_delivered text check (materials_delivered is null or char_length(materials_delivered) <= 4000),
  equipment_used text check (equipment_used is null or char_length(equipment_used) <= 4000),
  delivery_notes text check (delivery_notes is null or char_length(delivery_notes) <= 2000),
  delay_description text check (delay_description is null or char_length(delay_description) <= 4000),
  delay_reason text check (delay_reason is null or char_length(delay_reason) <= 1000),
  delay_impact text check (delay_impact is null or char_length(delay_impact) <= 1000),
  corrective_actions text check (corrective_actions is null or char_length(corrective_actions) <= 4000),
  safety_observations text check (safety_observations is null or char_length(safety_observations) <= 4000),
  has_delays boolean generated always as (delay_description is not null) stored,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, log_date),
  check ((status = 'finalized') = (finalized_at is not null))
);
create index daily_logs_project_idx on public.daily_logs (project_id, log_date desc, id desc);
create index daily_logs_org_idx on public.daily_logs (organization_id, log_date desc);
create trigger daily_logs_updated_at before update on public.daily_logs
  for each row execute function public.set_updated_at();

create table public.daily_log_crews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  daily_log_id uuid not null references public.daily_logs(id) on delete restrict,
  trade text not null check (char_length(btrim(trade)) between 1 and 120),
  crew_size integer check (crew_size is null or crew_size between 0 and 500),
  hours_worked numeric(7,2) check (hours_worked is null or (hours_worked >= 0 and hours_worked <= 5000)),
  notes text check (notes is null or char_length(notes) <= 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index daily_log_crews_log_idx on public.daily_log_crews (daily_log_id, sort_order);

create table public.daily_log_activities (
  daily_log_id uuid not null references public.daily_logs(id) on delete restrict,
  schedule_activity_id uuid not null references public.schedule_activities(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (daily_log_id, schedule_activity_id)
);
create index daily_log_activities_activity_idx on public.daily_log_activities (schedule_activity_id);

create table public.daily_log_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  daily_log_id uuid not null references public.daily_logs(id) on delete restrict,
  storage_path text not null unique check (storage_path like 'daily-logs/' || daily_log_id::text || '/%'),
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  caption text check (caption is null or char_length(caption) <= 300),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index daily_log_photos_log_idx on public.daily_log_photos (daily_log_id, created_at);

-- ============ WRITE GUARDS ============
create or replace function public.daily_logs_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project_org uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'Daily logs cannot be deleted.';
  end if;

  select p.organization_id into v_project_org from public.projects p where p.id = new.project_id;
  if v_project_org is null or v_project_org <> new.organization_id then
    raise exception 'Project does not belong to this organization';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'New daily logs must start as drafts'; end if;
    if new.log_date > public.org_today(new.organization_id) + 1 then
      raise exception 'A daily log cannot be dated in the future';
    end if;
    new.version := 1;
    new.author_id := auth.uid();
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.finalized_at := null;
    new.finalized_by := null;
    return new;
  end if;

  if old.status = 'finalized' then
    raise exception 'This daily log is finalized and can no longer be changed.';
  end if;
  if new.project_id <> old.project_id or new.organization_id <> old.organization_id
     or new.author_id is distinct from old.author_id or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Daily log identity fields cannot be changed';
  end if;
  if new.log_date <> old.log_date and new.log_date > public.org_today(new.organization_id) + 1 then
    raise exception 'A daily log cannot be dated in the future';
  end if;

  new.version := old.version + 1;
  new.updated_by := auth.uid();

  if new.status = 'finalized' then
    if coalesce(btrim(new.work_performed), '') = '' then
      raise exception 'Describe the work performed before finalizing';
    end if;
    new.finalized_at := now();
    new.finalized_by := auth.uid();
  else
    new.finalized_at := null;
    new.finalized_by := null;
  end if;
  return new;
end;
$$;
create trigger daily_logs_before_write before insert or update or delete on public.daily_logs
  for each row execute function public.daily_logs_before_write();
create trigger audit_daily_logs after insert or update or delete on public.daily_logs
  for each row execute function public.write_audit_event();

-- Children may change only while the parent log is a draft in the same organization.
create or replace function public.daily_log_child_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_log record;
  v_count integer;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  select l.status, l.organization_id, l.project_id into v_log from public.daily_logs l where l.id = v_row.daily_log_id;
  if v_log.status is null then raise exception 'Daily log not found'; end if;
  if v_log.status <> 'draft' then
    raise exception 'This daily log is finalized; its records are preserved as reported.';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.organization_id <> v_log.organization_id then
    raise exception 'Record does not belong to this organization';
  end if;
  if tg_op = 'UPDATE' and new.daily_log_id <> old.daily_log_id then
    raise exception 'Records cannot be moved between daily logs';
  end if;

  if tg_table_name = 'daily_log_activities' then
    if not exists (select 1 from public.schedule_activities a
                   where a.id = new.schedule_activity_id and a.project_id = v_log.project_id) then
      raise exception 'Schedule activity must belong to this project';
    end if;
  elsif tg_table_name = 'daily_log_photos' and tg_op = 'INSERT' then
    select count(*) into v_count from public.daily_log_photos p where p.daily_log_id = new.daily_log_id;
    if v_count >= 30 then raise exception 'A daily log can hold up to 30 photos'; end if;
    new.uploaded_by := auth.uid();
  elsif tg_table_name = 'daily_log_photos' and tg_op = 'UPDATE' then
    if new.storage_path <> old.storage_path or new.uploaded_by is distinct from old.uploaded_by then
      raise exception 'Only the caption of a photo can be changed';
    end if;
  end if;
  return new;
end;
$$;
create trigger daily_log_crews_guard before insert or update or delete on public.daily_log_crews
  for each row execute function public.daily_log_child_guard();
create trigger daily_log_activities_guard before insert or update or delete on public.daily_log_activities
  for each row execute function public.daily_log_child_guard();
create trigger daily_log_photos_guard before insert or update or delete on public.daily_log_photos
  for each row execute function public.daily_log_child_guard();
create trigger audit_daily_log_photos after insert or update or delete on public.daily_log_photos
  for each row execute function public.write_audit_event();

-- ============ RLS ============
alter table public.daily_logs enable row level security;
create policy daily_logs_select on public.daily_logs for select to authenticated
  using (public.is_org_staff(organization_id) and public.can_view_project_internal(project_id));
create policy daily_logs_insert on public.daily_logs for insert to authenticated
  with check (public.is_org_staff(organization_id) and public.can_view_project_internal(project_id));
create policy daily_logs_update on public.daily_logs for update to authenticated
  using (public.is_org_staff(organization_id) and public.can_view_project_internal(project_id))
  with check (public.is_org_staff(organization_id) and public.can_view_project_internal(project_id));
-- No delete policy: logs are never deleted.

do $$
declare t text;
begin
  foreach t in array array['daily_log_crews', 'daily_log_activities', 'daily_log_photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.daily_logs l where l.id = daily_log_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.daily_logs l where l.id = daily_log_id)) with check (exists (select 1 from public.daily_logs l where l.id = daily_log_id and l.organization_id = %I.organization_id))',
      t || '_write', t, t);
  end loop;

  foreach t in array array['daily_logs', 'daily_log_crews', 'daily_log_activities', 'daily_log_photos'] loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.is_feature_enabled(organization_id, %L)) with check (public.is_feature_enabled(organization_id, %L))',
      t || '_feature_gate', t, 'daily_logs', 'daily_logs');
  end loop;
end $$;

-- ============ STORAGE (project-media, path daily-logs/{log_id}/{file}) ============
create or replace function public.can_upload_media_path(p_path text)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w
      join public.walkthrough_items i on i.walkthrough_id = w.id and i.id = public.media_path_uuid(p_path, 3)
      where w.id = public.media_path_uuid(p_path, 2)
        and w.status <> 'submitted'
        and public.is_project_homeowner(w.project_id)
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and pi.status <> 'closed'
        and (public.can_view_project_internal(pi.project_id)
          or (split_part(p_path, '/', 3) = 'feedback'
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
    else false
  end;
$function$;

create or replace function public.can_view_media_path(p_path text)
 returns boolean language sql stable security definer set search_path to ''
as $function$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w where w.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(w.project_id) or public.is_project_homeowner(w.project_id))
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(pi.project_id) or public.is_project_homeowner(pi.project_id))
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
    else false
  end;
$function$;

-- Draft-only cleanup of objects whose photo row has already been removed (or failed to register).
create policy project_media_daily_log_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-media'
    and split_part(name, '/', 1) = 'daily-logs'
    and public.can_upload_media_path(name)
    and not exists (select 1 from public.daily_log_photos p where p.storage_path = name)
  );

-- ============ RPCs (security invoker: RLS still applies) ============

-- Saves the log body, the full crew list and activity links atomically. Creates when p_id is null.
create or replace function public.save_daily_log(
  p_project uuid, p_id uuid, p_expected_version integer, p_header jsonb, p_crews jsonb, p_activity_ids uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid := p_id;
  v_date date := (p_header->>'log_date')::date;
  v_bad uuid;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null or not public.can_view_project_internal(p_project) then
    raise exception 'Project not found or access denied';
  end if;
  if jsonb_typeof(p_crews) <> 'array' or jsonb_array_length(p_crews) > 40 then
    raise exception 'Crew entries are invalid';
  end if;
  if coalesce(array_length(p_activity_ids, 1), 0) > 50 then
    raise exception 'Link at most 50 schedule activities';
  end if;
  select a into v_bad from unnest(coalesce(p_activity_ids, '{}')) a
    where not exists (select 1 from public.schedule_activities s where s.id = a and s.project_id = p_project) limit 1;
  if v_bad is not null then raise exception 'Schedule activity must belong to this project'; end if;

  if v_id is null then
    if exists (select 1 from public.daily_logs l where l.project_id = p_project and l.log_date = v_date) then
      raise exception 'A daily log already exists for this date. Open it from the log history instead.';
    end if;
    insert into public.daily_logs (organization_id, project_id, log_date)
    values (v_org, p_project, v_date) returning id into v_id;
    p_expected_version := 1;
  end if;

  update public.daily_logs l set
    log_date = v_date,
    weather_conditions = p_header->>'weather_conditions',
    temperature_f = (p_header->>'temperature_f')::integer,
    weather_impact = p_header->>'weather_impact',
    site_conditions = p_header->>'site_conditions',
    work_performed = p_header->>'work_performed',
    progress_notes = p_header->>'progress_notes',
    work_planned_next = p_header->>'work_planned_next',
    materials_delivered = p_header->>'materials_delivered',
    equipment_used = p_header->>'equipment_used',
    delivery_notes = p_header->>'delivery_notes',
    delay_description = p_header->>'delay_description',
    delay_reason = p_header->>'delay_reason',
    delay_impact = p_header->>'delay_impact',
    corrective_actions = p_header->>'corrective_actions',
    safety_observations = p_header->>'safety_observations'
  where l.id = v_id and l.project_id = p_project and l.status = 'draft' and l.version = p_expected_version;
  if not found then
    if exists (select 1 from public.daily_logs l where l.id = v_id and l.status = 'finalized') then
      raise exception 'This daily log is finalized and can no longer be changed.';
    end if;
    raise exception 'This log was changed by someone else. Reload the page to see the latest version.';
  end if;

  delete from public.daily_log_crews c where c.daily_log_id = v_id;
  insert into public.daily_log_crews (organization_id, daily_log_id, trade, crew_size, hours_worked, notes, sort_order)
  select v_org, v_id, btrim(e->>'trade'), (e->>'crew_size')::integer, (e->>'hours_worked')::numeric, nullif(btrim(e->>'notes'), ''), ord::integer
  from jsonb_array_elements(p_crews) with ordinality as t(e, ord);

  delete from public.daily_log_activities a where a.daily_log_id = v_id
    and a.schedule_activity_id <> all (coalesce(p_activity_ids, '{}'));
  insert into public.daily_log_activities (daily_log_id, schedule_activity_id, organization_id)
  select v_id, a, v_org from unnest(coalesce(p_activity_ids, '{}')) a
  on conflict do nothing;

  return v_id;
end;
$$;
grant execute on function public.save_daily_log(uuid, uuid, integer, jsonb, jsonb, uuid[]) to authenticated;

create or replace function public.finalize_daily_log(p_id uuid, p_expected_version integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_status text;
begin
  select l.status into v_status from public.daily_logs l where l.id = p_id for update;
  if v_status is null then raise exception 'Daily log not found or access denied'; end if;
  if v_status = 'finalized' then raise exception 'This daily log is already finalized.'; end if;
  update public.daily_logs l set status = 'finalized' where l.id = p_id and l.version = p_expected_version;
  if not found then
    raise exception 'This log was changed by someone else. Reload the page and review it before finalizing.';
  end if;
end;
$$;
grant execute on function public.finalize_daily_log(uuid, integer) to authenticated;
