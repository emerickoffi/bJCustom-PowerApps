-- Builder-side subcontractor work assignments on schedule activities, plus optional subcontractor company
-- references on daily log crew rows. Additive only; no existing rows are changed.
--
-- * Subcontractor companies are directory records, not users. Nothing here creates auth accounts,
--   organization memberships, project members, or portal access for subcontractors.
-- * Only organization admins and project managers (public.is_org_manager) who can view the project internally
--   may read or write assignments, and only while both the 'subcontractors' and 'schedule' features are on.
-- * Assignments never update schedule_activities, so progress and completion calculations are unchanged.
-- * Assignments are never deleted by users; revoking sets status = 'revoked'. Every change is audited.
-- * Inactive subcontractors cannot receive new assignments; existing assignments stay visible for history.

create table public.schedule_activity_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  schedule_activity_id uuid not null references public.schedule_activities(id) on delete cascade,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  scope_of_work text not null check (char_length(btrim(scope_of_work)) between 1 and 2000),
  status text not null default 'active' check (status in ('active', 'revoked')),
  assigned_by uuid references auth.users(id) on delete set null,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_activity_assignments_revoked_state check ((status = 'revoked') = (revoked_at is not null))
);
create unique index schedule_activity_assignments_active_key
  on public.schedule_activity_assignments (schedule_activity_id, subcontractor_company_id) where status = 'active';
create index schedule_activity_assignments_company_idx
  on public.schedule_activity_assignments (organization_id, subcontractor_company_id, status);
create index schedule_activity_assignments_project_idx
  on public.schedule_activity_assignments (project_id, status);

create trigger schedule_activity_assignments_updated_at before update on public.schedule_activity_assignments
  for each row execute function public.set_updated_at();

create or replace function public.schedule_activity_assignments_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_activity record;
  v_company record;
begin
  if tg_op = 'INSERT' then
    select a.project_id, a.organization_id into v_activity
      from public.schedule_activities a where a.id = new.schedule_activity_id;
    if v_activity.project_id is null then raise exception 'Schedule activity not found'; end if;
    -- Project and organization always come from the activity, never from the caller.
    new.project_id := v_activity.project_id;
    new.organization_id := v_activity.organization_id;

    select c.organization_id, c.status into v_company
      from public.subcontractor_companies c where c.id = new.subcontractor_company_id;
    if v_company.organization_id is null or v_company.organization_id <> new.organization_id then
      raise exception 'Subcontractor must belong to this organization';
    end if;
    if v_company.status <> 'active' then
      raise exception 'Inactive subcontractors cannot receive new assignments';
    end if;

    new.scope_of_work := btrim(new.scope_of_work);
    new.status := 'active';
    new.assigned_by := auth.uid();
    new.revoked_by := null;
    new.revoked_at := null;
    new.revoke_reason := null;
    return new;
  end if;

  if old.status = 'revoked' then
    raise exception 'Revoked assignments are kept as history and cannot be changed';
  end if;
  if new.organization_id <> old.organization_id or new.project_id <> old.project_id
     or new.schedule_activity_id <> old.schedule_activity_id
     or new.subcontractor_company_id <> old.subcontractor_company_id
     or new.assigned_by is distinct from old.assigned_by or new.created_at <> old.created_at then
    raise exception 'Assignment identity fields cannot be changed; reassign instead';
  end if;
  new.scope_of_work := btrim(new.scope_of_work);
  if new.status = 'revoked' then
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  else
    new.revoked_at := null;
    new.revoked_by := null;
    new.revoke_reason := null;
  end if;
  return new;
end;
$$;
create trigger schedule_activity_assignments_before_write before insert or update on public.schedule_activity_assignments
  for each row execute function public.schedule_activity_assignments_before_write();
create trigger audit_schedule_activity_assignments after insert or update or delete on public.schedule_activity_assignments
  for each row execute function public.write_audit_event();

-- ============ RLS ============
alter table public.schedule_activity_assignments enable row level security;
revoke all on public.schedule_activity_assignments from anon;
revoke delete, truncate on public.schedule_activity_assignments from authenticated;

create policy schedule_activity_assignments_select on public.schedule_activity_assignments for select to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy schedule_activity_assignments_insert on public.schedule_activity_assignments for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy schedule_activity_assignments_update on public.schedule_activity_assignments for update to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id))
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
-- No delete policy: users revoke instead. Rows only disappear when their activity or project is removed.

create policy schedule_activity_assignments_feature on public.schedule_activity_assignments
  as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'subcontractors') and public.is_feature_enabled(organization_id, 'schedule'))
  with check (public.is_feature_enabled(organization_id, 'subcontractors') and public.is_feature_enabled(organization_id, 'schedule'));

-- Revokes one active assignment and creates its replacement atomically (security invoker: RLS applies).
create or replace function public.reassign_schedule_assignment(p_id uuid, p_company uuid, p_scope text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_activity uuid;
  v_org uuid;
  v_project uuid;
  v_new uuid;
begin
  update public.schedule_activity_assignments a
     set status = 'revoked', revoke_reason = 'Reassigned'
   where a.id = p_id and a.status = 'active'
  returning a.schedule_activity_id, a.organization_id, a.project_id into v_activity, v_org, v_project;
  if v_activity is null then
    raise exception 'Assignment not found, already revoked, or access denied';
  end if;
  insert into public.schedule_activity_assignments
    (organization_id, project_id, schedule_activity_id, subcontractor_company_id, scope_of_work)
  values (v_org, v_project, v_activity, p_company, p_scope)
  returning id into v_new;
  return v_new;
end;
$$;
revoke execute on function public.reassign_schedule_assignment(uuid, uuid, text) from public, anon;
grant execute on function public.reassign_schedule_assignment(uuid, uuid, text) to authenticated;

-- ============ DAILY LOG CREWS: optional subcontractor company reference ============
-- company_name is a snapshot taken by the server so a finalized log keeps the name as reported,
-- even for staff who cannot read the manager-only subcontractor directory.
alter table public.daily_log_crews
  add column subcontractor_company_id uuid references public.subcontractor_companies(id) on delete restrict,
  add column company_name text check (company_name is null or char_length(company_name) <= 160);
create index daily_log_crews_company_idx on public.daily_log_crews (subcontractor_company_id)
  where subcontractor_company_id is not null;

create or replace function public.daily_log_crew_company()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if new.subcontractor_company_id is null then
    new.company_name := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.subcontractor_company_id = old.subcontractor_company_id then
    new.company_name := old.company_name;
    return new;
  end if;
  select c.company_name into v_name from public.subcontractor_companies c
   where c.id = new.subcontractor_company_id and c.organization_id = new.organization_id;
  if v_name is null then
    raise exception 'Subcontractor company must belong to this organization';
  end if;
  new.company_name := v_name;
  return new;
end;
$$;
-- Named to fire after daily_log_crews_guard, which has already verified the organization and draft status.
create trigger daily_log_crews_zz_company before insert or update on public.daily_log_crews
  for each row execute function public.daily_log_crew_company();

-- Same contract as before; crew entries may now carry subcontractor_company_id.
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
  insert into public.daily_log_crews
    (organization_id, daily_log_id, trade, crew_size, hours_worked, notes, sort_order, subcontractor_company_id)
  select v_org, v_id, btrim(e->>'trade'), (e->>'crew_size')::integer, (e->>'hours_worked')::numeric,
         nullif(btrim(e->>'notes'), ''), ord::integer, nullif(e->>'subcontractor_company_id', '')::uuid
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
