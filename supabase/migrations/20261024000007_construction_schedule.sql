-- Stage 1 of the Schedule module: one authoritative schedule per project.
-- Schedule activities are the single source of truth for milestone progress;
-- projects.progress_percent is derived from them (weighted) and never stored twice.

create table public.schedule_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  template_key text check (template_key is null or template_key ~ '^[a-z0-9_]{1,60}$'),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  phase text not null default 'General' check (char_length(btrim(phase)) between 1 and 80),
  activity_type text not null default 'task' check (activity_type in ('task', 'milestone', 'inspection', 'meeting')),
  sort_order integer not null default 0,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  assigned_to uuid references auth.users(id) on delete set null,
  percent_complete numeric(5,2) not null default 0 check (percent_complete between 0 and 100),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed', 'delayed', 'on_hold', 'skipped')),
  weight numeric(6,2) not null default 1 check (weight >= 0 and weight <= 1000),
  delay_reason text check (delay_reason is null or char_length(delay_reason) <= 2000),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 5000),
  public_note text check (public_note is null or char_length(public_note) <= 1000),
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, template_key),
  check (planned_start is null or planned_end is null or planned_end >= planned_start),
  check (actual_start is null or actual_end is null or actual_end >= actual_start)
);
create index schedule_activities_project_idx on public.schedule_activities (project_id, sort_order);
create index schedule_activities_assigned_idx on public.schedule_activities (assigned_to);
create trigger schedule_activities_updated_at before update on public.schedule_activities
  for each row execute function public.set_updated_at();

create table public.schedule_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  predecessor_id uuid not null references public.schedule_activities(id) on delete cascade,
  successor_id uuid not null references public.schedule_activities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);
create index schedule_dependencies_project_idx on public.schedule_dependencies (project_id);
create index schedule_dependencies_successor_idx on public.schedule_dependencies (successor_id);

-- Append-only change history. activity_id intentionally has no FK so history survives deletion.
create table public.schedule_activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  activity_id uuid not null,
  activity_name text not null,
  event_type text not null check (event_type in ('created', 'updated', 'deleted')),
  actor_id uuid references auth.users(id) on delete set null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index schedule_activity_events_project_idx on public.schedule_activity_events (project_id, created_at desc);
create index schedule_activity_events_activity_idx on public.schedule_activity_events (activity_id, created_at desc);

-- Immutable approved snapshots. Live activities never rewrite a baseline.
create table public.schedule_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  version integer not null check (version > 0),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create or replace function public.block_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% records are permanent and cannot be changed or deleted', tg_table_name;
end;
$$;
create trigger schedule_activity_events_immutable before update or delete on public.schedule_activity_events
  for each row execute function public.block_change();
create trigger schedule_baselines_immutable before update or delete on public.schedule_baselines
  for each row execute function public.block_change();

-- ============ VALIDATION ============
create or replace function public.validate_schedule_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.organization_id <> old.organization_id) then
    raise exception 'Schedule activities cannot be moved between projects';
  end if;

  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (
       select 1 from public.organization_memberships m
       where m.organization_id = new.organization_id and m.user_id = new.assigned_to and m.status = 'active'
         and m.role in ('org_admin', 'project_manager', 'builder_staff')
     ) then
    raise exception 'Assigned person must be active builder staff';
  end if;

  new.name := btrim(new.name);
  new.phase := btrim(new.phase);

  if new.status = 'completed' then
    new.percent_complete := 100;
    new.actual_end := coalesce(new.actual_end, current_date);
    new.actual_start := coalesce(new.actual_start, new.actual_end);
  elsif new.percent_complete = 100 and new.status in ('not_started', 'in_progress') then
    new.status := 'completed';
    new.actual_end := coalesce(new.actual_end, current_date);
    new.actual_start := coalesce(new.actual_start, new.actual_end);
  else
    if new.actual_end is not null and new.status <> 'skipped' then
      raise exception 'An actual finish date can only be set on a completed activity';
    end if;
    if new.status = 'in_progress' then
      new.actual_start := coalesce(new.actual_start, current_date);
    end if;
  end if;

  if new.actual_start is not null and new.actual_end is not null and new.actual_end < new.actual_start then
    raise exception 'Actual finish cannot be before actual start';
  end if;
  if new.actual_start is not null and new.actual_start > current_date + 1 then
    raise exception 'Actual start cannot be in the future';
  end if;
  if new.actual_end is not null and new.actual_end > current_date + 1 then
    raise exception 'Actual finish cannot be in the future';
  end if;
  if new.status = 'delayed' and coalesce(btrim(new.delay_reason), '') = '' then
    raise exception 'Record a reason when marking an activity delayed';
  end if;
  return new;
end;
$$;
create trigger schedule_activities_validate before insert or update on public.schedule_activities
  for each row execute function public.validate_schedule_activity();

create or replace function public.validate_schedule_dependency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  if (select count(*) from public.schedule_activities a
      where a.id in (new.predecessor_id, new.successor_id) and a.project_id = new.project_id) <> 2 then
    raise exception 'Both activities must belong to the same project schedule';
  end if;

  -- Serialize dependency edits per project so concurrent inserts cannot form a cycle together.
  perform 1 from public.projects p where p.id = new.project_id for update;

  if exists (
    with recursive downstream(id) as (
      select d.successor_id from public.schedule_dependencies d where d.predecessor_id = new.successor_id
      union
      select d.successor_id from public.schedule_dependencies d join downstream ds on d.predecessor_id = ds.id
    )
    select 1 from downstream where id = new.predecessor_id
  ) then
    raise exception 'This dependency would create a circular schedule';
  end if;
  return new;
end;
$$;
create trigger schedule_dependencies_validate before insert or update on public.schedule_dependencies
  for each row execute function public.validate_schedule_dependency();

-- ============ HISTORY ============
create or replace function public.record_schedule_activity_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_new jsonb;
  v_old jsonb;
begin
  if tg_op = 'DELETE' then
    insert into public.schedule_activity_events (organization_id, project_id, activity_id, activity_name, event_type, actor_id, changes)
      values (old.organization_id, old.project_id, old.id, old.name, 'deleted', auth.uid(), '{}'::jsonb);
    return old;
  end if;

  if tg_op = 'INSERT' then
    insert into public.schedule_activity_events (organization_id, project_id, activity_id, activity_name, event_type, actor_id, changes)
      values (new.organization_id, new.project_id, new.id, new.name, 'created', auth.uid(), '{}'::jsonb);
    return new;
  end if;

  v_new := to_jsonb(new);
  v_old := to_jsonb(old);
  foreach v_key in array array[
    'name', 'phase', 'activity_type', 'planned_start', 'planned_end', 'actual_start', 'actual_end',
    'assigned_to', 'percent_complete', 'status', 'weight', 'delay_reason', 'public_note', 'is_published', 'internal_notes'
  ] loop
    if v_new -> v_key is distinct from v_old -> v_key then
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
    end if;
  end loop;

  if v_changes <> '{}'::jsonb then
    insert into public.schedule_activity_events (organization_id, project_id, activity_id, activity_name, event_type, actor_id, changes)
      values (new.organization_id, new.project_id, new.id, new.name, 'updated', auth.uid(), v_changes);
  end if;
  return new;
end;
$$;
create trigger schedule_activities_history after insert or update or delete on public.schedule_activities
  for each row execute function public.record_schedule_activity_event();

-- ============ PROGRESS SYNC (Construction Tracker) ============
-- Overall completion = sum(weight * percent_complete) / sum(weight), excluding skipped and zero-weight activities.
create or replace function public.recalculate_project_progress(p_project uuid)
returns void language sql security definer set search_path = '' as $$
  update public.projects p
     set progress_percent = coalesce((
       select round(sum(a.weight * a.percent_complete) / nullif(sum(a.weight), 0), 2)
       from public.schedule_activities a
       where a.project_id = p_project and a.status <> 'skipped' and a.weight > 0
     ), p.progress_percent)
   where p.id = p_project
     and exists (select 1 from public.schedule_activities a where a.project_id = p_project);
$$;
revoke execute on function public.recalculate_project_progress(uuid) from public, anon, authenticated;

create or replace function public.sync_project_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.recalculate_project_progress(coalesce(new.project_id, old.project_id));
  return null;
end;
$$;
create trigger schedule_activities_progress_ins_del after insert or delete on public.schedule_activities
  for each row execute function public.sync_project_progress();
create trigger schedule_activities_progress_upd after update of weight, percent_complete, status on public.schedule_activities
  for each row execute function public.sync_project_progress();

-- ============ RPCs ============
create or replace function public.initialize_project_schedule(p_project uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_count integer := 0;
  v_new uuid;
  v_pred uuid;
  v_key text;
  t record;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null then raise exception 'Project not found or access denied'; end if;
  if not public.is_org_manager(v_org) then
    raise exception 'Only an administrator or project manager can initialize a schedule';
  end if;

  for t in
    select * from (values
      (1,  'preconstruction',     'Preconstruction',        'Preconstruction', 'milestone',  2::numeric, null::text[]),
      (2,  'site_preparation',    'Site Preparation',       'Site work',       'task',       3, array['preconstruction']),
      (3,  'excavation',          'Excavation',             'Site work',       'task',       3, array['site_preparation']),
      (4,  'foundation',          'Foundation',             'Foundation',      'milestone',  8, array['excavation']),
      (5,  'framing',             'Framing',                'Structure',       'milestone', 12, array['foundation']),
      (6,  'roofing',             'Roofing',                'Structure',       'task',       5, array['framing']),
      (7,  'plumbing_rough_in',   'Plumbing Rough-In',      'Rough-ins',       'task',       4, array['roofing']),
      (8,  'electrical_rough_in', 'Electrical Rough-In',    'Rough-ins',       'task',       4, array['roofing']),
      (9,  'hvac_rough_in',       'HVAC Rough-In',          'Rough-ins',       'task',       4, array['roofing']),
      (10, 'low_voltage_rough_in','Low Voltage Rough-In',   'Rough-ins',       'task',       1, array['electrical_rough_in']),
      (11, 'rough_inspections',   'Required Inspections',   'Rough-ins',       'inspection', 1, array['plumbing_rough_in','electrical_rough_in','hvac_rough_in','low_voltage_rough_in']),
      (12, 'insulation',          'Insulation',             'Interior',        'task',       2, array['rough_inspections']),
      (13, 'drywall',             'Drywall',                'Interior',        'milestone',  5, array['insulation']),
      (14, 'exterior_finishes',   'Exterior Finishes',      'Exterior',        'task',       6, array['roofing']),
      (15, 'interior_trim',       'Interior Trim',          'Interior',        'task',       4, array['drywall']),
      (16, 'cabinets',            'Cabinets',               'Interior',        'task',       4, array['drywall']),
      (17, 'countertops',         'Countertops',            'Interior',        'task',       3, array['cabinets']),
      (18, 'flooring',            'Flooring',               'Interior',        'task',       4, array['drywall']),
      (19, 'painting',            'Painting',               'Interior',        'task',       4, array['interior_trim']),
      (20, 'plumbing_fixtures',   'Plumbing Fixtures',      'Finishes',        'task',       2, array['countertops']),
      (21, 'electrical_fixtures', 'Electrical Fixtures',    'Finishes',        'task',       2, array['painting']),
      (22, 'hvac_completion',     'HVAC Completion',        'Finishes',        'task',       2, array['painting']),
      (23, 'appliances',          'Appliances',             'Finishes',        'task',       1, array['countertops','flooring']),
      (24, 'exterior_flatwork',   'Exterior Flatwork',      'Exterior',        'task',       3, array['exterior_finishes']),
      (25, 'landscaping',         'Landscaping',            'Exterior',        'task',       3, array['exterior_flatwork']),
      (26, 'final_cleaning',      'Final Cleaning',         'Closeout',        'task',       1, array['plumbing_fixtures','electrical_fixtures','hvac_completion','appliances','landscaping']),
      (27, 'final_inspection',    'Final Inspection',       'Closeout',        'inspection', 1, array['final_cleaning']),
      (28, 'client_walkthrough',  'Client Walkthrough',     'Closeout',        'meeting',    1, array['final_inspection']),
      (29, 'punch_list',          'Punch List Resolution',  'Closeout',        'task',       2, array['client_walkthrough']),
      (30, 'project_handover',    'Project Handover',       'Closeout',        'milestone',  1, array['punch_list'])
    ) as x(ord, key, name, phase, kind, weight, preds)
    order by ord
  loop
    v_new := null;
    insert into public.schedule_activities (
      organization_id, project_id, template_key, name, phase, activity_type, weight, sort_order, created_by, updated_by
    ) values (v_org, p_project, t.key, t.name, t.phase, t.kind, t.weight, t.ord * 10, auth.uid(), auth.uid())
    on conflict (project_id, template_key) do nothing
    returning id into v_new;

    -- Only wire dependencies for newly created stages so builder customizations are never overwritten.
    if v_new is not null then
      v_count := v_count + 1;
      if t.preds is not null then
        foreach v_key in array t.preds loop
          v_pred := null;
          select a.id into v_pred from public.schedule_activities a
            where a.project_id = p_project and a.template_key = v_key;
          if v_pred is not null then
            insert into public.schedule_dependencies (organization_id, project_id, predecessor_id, successor_id, created_by)
              values (v_org, p_project, v_pred, v_new, auth.uid())
              on conflict (predecessor_id, successor_id) do nothing;
          end if;
        end loop;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.capture_schedule_baseline(p_project uuid, p_name text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_version integer;
  v_id uuid;
  v_snapshot jsonb;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project for update;
  if v_org is null or not public.is_org_manager(v_org) then
    raise exception 'Only an administrator or project manager can approve a schedule baseline';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'activity_id', a.id, 'name', a.name, 'phase', a.phase, 'activity_type', a.activity_type,
           'planned_start', a.planned_start, 'planned_end', a.planned_end, 'weight', a.weight, 'sort_order', a.sort_order
         ) order by a.sort_order, a.created_at), '[]'::jsonb)
    into v_snapshot
    from public.schedule_activities a where a.project_id = p_project;
  if jsonb_array_length(v_snapshot) = 0 then
    raise exception 'Add schedule activities before approving a baseline';
  end if;

  select coalesce(max(b.version), 0) + 1 into v_version from public.schedule_baselines b where b.project_id = p_project;
  insert into public.schedule_baselines (organization_id, project_id, version, name, notes, snapshot, created_by)
    values (v_org, p_project, v_version, btrim(p_name), nullif(btrim(coalesce(p_notes, '')), ''), v_snapshot, auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;

-- Homeowner-safe projection: published rows only, never internal notes, delay reasons, or assignees.
create or replace function public.get_published_schedule(p_project uuid)
returns table (
  id uuid, phase text, name text, activity_type text, sort_order integer,
  planned_start date, planned_end date, actual_start date, actual_end date,
  percent_complete numeric, status text, public_note text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_project_homeowner(p_project) or public.can_view_project_internal(p_project)) then
    raise exception 'Project not found';
  end if;
  return query
    select a.id, a.phase, a.name, a.activity_type, a.sort_order,
           a.planned_start, a.planned_end, a.actual_start, a.actual_end,
           a.percent_complete, a.status, a.public_note
    from public.schedule_activities a
    where a.project_id = p_project and a.is_published and a.status <> 'skipped'
    order by a.sort_order, a.created_at;
end;
$$;

revoke execute on function public.initialize_project_schedule(uuid) from public, anon;
revoke execute on function public.capture_schedule_baseline(uuid, text, text) from public, anon;
revoke execute on function public.get_published_schedule(uuid) from public, anon;
grant execute on function public.initialize_project_schedule(uuid) to authenticated;
grant execute on function public.capture_schedule_baseline(uuid, text, text) to authenticated;
grant execute on function public.get_published_schedule(uuid) to authenticated;

-- ============ RLS ============
alter table public.schedule_activities enable row level security;
alter table public.schedule_dependencies enable row level security;
alter table public.schedule_activity_events enable row level security;
alter table public.schedule_baselines enable row level security;

create policy schedule_activities_select on public.schedule_activities for select to authenticated
  using (public.can_view_project_internal(project_id));
create policy schedule_activities_insert on public.schedule_activities for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy schedule_activities_update on public.schedule_activities for update to authenticated
  using (public.can_view_project_internal(project_id) and public.is_org_staff(organization_id))
  with check (public.can_view_project_internal(project_id) and public.is_org_staff(organization_id));
create policy schedule_activities_delete on public.schedule_activities for delete to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));

create policy schedule_dependencies_select on public.schedule_dependencies for select to authenticated
  using (public.can_view_project_internal(project_id));
create policy schedule_dependencies_insert on public.schedule_dependencies for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy schedule_dependencies_delete on public.schedule_dependencies for delete to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));

create policy schedule_activity_events_select on public.schedule_activity_events for select to authenticated
  using (public.can_view_project_internal(project_id));

create policy schedule_baselines_select on public.schedule_baselines for select to authenticated
  using (public.can_view_project_internal(project_id));
