-- Lets a subcontractor's project assignment be ended without losing it. FOR REVIEW — not yet applied.
-- Additive only, on the existing public.subcontractor_project_assignments table (no new association table).
--
-- Apply after 20261101000010_subcontractor_project_assignments.sql. Both must be applied before the
-- Project Assignments section on the subcontractor forms becomes available.
--
-- Rules:
-- * Rows are still never deleted. "Removing" a project sets ended_at (plus who ended it and an optional reason)
--   exactly once; every other column is frozen. Ended rows are the subcontractor's project history.
-- * Only one ACTIVE association per company and project. An ended association can be followed by a new one,
--   so a company can return to a project without rewriting its history.
-- * Ending never touches schedule_activity_assignments, daily logs, or financial records. If the company still has
--   active scheduled activities on the project, ending is refused unless the caller explicitly chooses to keep
--   that scheduled work as is (p_keep_active_work = true).
-- * Same permissions as creating: organization admins and project managers in the row's organization, only while
--   the 'subcontractors' feature is on.

alter table public.subcontractor_project_assignments
  add column ended_at timestamptz,
  add column ended_by uuid references auth.users(id) on delete set null,
  add column end_reason text check (end_reason is null or char_length(btrim(end_reason)) between 1 and 500),
  add constraint subcontractor_project_assignments_end_state
    check (ended_at is not null or (ended_by is null and end_reason is null));

drop index public.subcontractor_project_assignments_company_project_key;
create unique index subcontractor_project_assignments_active_key
  on public.subcontractor_project_assignments (subcontractor_company_id, project_id)
  where ended_at is null;

-- Same trigger name and binding as before; only the function body changes.
create or replace function public.subcontractor_project_assignments_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project record;
  v_company record;
begin
  if tg_op = 'DELETE' then
    raise exception 'Project assignments are kept as history and cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.ended_at is not null then
      raise exception 'This project assignment has already ended';
    end if;
    if new.ended_at is null then
      raise exception 'Project assignments can only be ended, not changed';
    end if;
    if new.id <> old.id or new.organization_id <> old.organization_id or new.project_id <> old.project_id
       or new.subcontractor_company_id <> old.subcontractor_company_id
       or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
      raise exception 'Project assignments can only be ended, not changed';
    end if;
    new.ended_at := now();
    new.ended_by := auth.uid();
    new.end_reason := nullif(btrim(new.end_reason), '');
    return new;
  end if;

  select p.organization_id, p.status into v_project from public.projects p where p.id = new.project_id;
  if v_project.organization_id is null then
    raise exception 'Project not found';
  end if;
  new.organization_id := v_project.organization_id;

  select c.organization_id, c.status into v_company
    from public.subcontractor_companies c where c.id = new.subcontractor_company_id;
  if v_company.organization_id is null or v_company.organization_id <> new.organization_id then
    raise exception 'Subcontractor and project must belong to the same organization';
  end if;
  if v_company.status <> 'active' then
    raise exception 'Inactive subcontractors cannot be assigned to projects';
  end if;
  if not public.project_accepts_new_assignments(v_project.status) then
    raise exception 'Subcontractors can only be assigned to projects in preconstruction, construction, or closeout';
  end if;

  new.created_by := auth.uid();
  new.created_at := now();
  new.ended_at := null;
  new.ended_by := null;
  new.end_reason := null;
  return new;
end;
$$;

-- ============ RLS ============
create policy subcontractor_project_assignments_update on public.subcontractor_project_assignments
  for update to authenticated
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id));
create policy subcontractor_project_assignments_feature_update on public.subcontractor_project_assignments
  as restrictive for update to authenticated
  using (public.is_feature_enabled(organization_id, 'subcontractors'))
  with check (public.is_feature_enabled(organization_id, 'subcontractors'));
-- Still no delete policy: deletes are denied for every role (and the trigger rejects them too).

-- ============ Atomic end ============
-- Locks the association, checks for active scheduled work, and ends it in one transaction.
-- Security definer so the active-work count sees every activity on the project, not only those visible to the
-- caller; permissions are therefore checked explicitly below, matching the RLS policies above.
create or replace function public.end_subcontractor_project_assignment(
  p_assignment_id uuid,
  p_reason text,
  p_keep_active_work boolean
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_active integer;
begin
  select a.id, a.organization_id, a.project_id, a.subcontractor_company_id, a.ended_at into v_row
    from public.subcontractor_project_assignments a
   where a.id = p_assignment_id
   for update;
  if v_row.id is null
     or not public.is_org_manager(v_row.organization_id)
     or not public.is_feature_enabled(v_row.organization_id, 'subcontractors') then
    raise exception 'Project assignment not found';
  end if;
  if v_row.ended_at is not null then
    raise exception 'This project assignment has already ended';
  end if;
  if p_reason is not null and char_length(btrim(p_reason)) > 500 then
    raise exception 'Keep the reason to 500 characters or fewer';
  end if;

  select count(*) into v_active
    from public.schedule_activity_assignments s
   where s.project_id = v_row.project_id
     and s.subcontractor_company_id = v_row.subcontractor_company_id
     and s.status = 'active';
  if v_active > 0 and not coalesce(p_keep_active_work, false) then
    raise exception 'This subcontractor still has % active scheduled % on this project', v_active,
      case when v_active = 1 then 'activity' else 'activities' end
      using errcode = 'BJ409';
  end if;

  update public.subcontractor_project_assignments
     set ended_at = now(), end_reason = nullif(btrim(p_reason), '')
   where id = v_row.id;

  return v_active;
end;
$$;
revoke all on function public.end_subcontractor_project_assignment(uuid, text, boolean) from public, anon;
grant execute on function public.end_subcontractor_project_assignment(uuid, text, boolean) to authenticated;
