-- New subcontractor construction assignments are only allowed while a project is in an active build stage.
-- Mirrors ASSIGNABLE_PROJECT_STATUSES in lib/domain.ts.
--
-- * Only INSERTs (new assignments and the replacement row created by reassign) are checked.
-- * Existing rows on completed, cancelled, or on-hold projects are untouched and stay readable, and can still be
--   revoked so history can be corrected. Nothing is deleted or revoked automatically on status changes.
-- * Warranty work is a separate module and is not affected.

create or replace function public.project_accepts_new_assignments(p_status public.project_status)
returns boolean language sql immutable set search_path = '' as $$
  select p_status in ('preconstruction', 'under_construction', 'final_inspection', 'punch_list', 'substantially_complete')
$$;
grant execute on function public.project_accepts_new_assignments(public.project_status) to authenticated;

create or replace function public.schedule_activity_assignments_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_activity record;
  v_company record;
  v_project_status public.project_status;
begin
  if tg_op = 'INSERT' then
    select a.project_id, a.organization_id into v_activity
      from public.schedule_activities a where a.id = new.schedule_activity_id;
    if v_activity.project_id is null then raise exception 'Schedule activity not found'; end if;
    -- Project and organization always come from the activity, never from the caller.
    new.project_id := v_activity.project_id;
    new.organization_id := v_activity.organization_id;

    select p.status into v_project_status from public.projects p where p.id = new.project_id;
    if v_project_status is null or not public.project_accepts_new_assignments(v_project_status) then
      raise exception 'New subcontractor assignments are only allowed on projects in preconstruction, construction, or closeout';
    end if;

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
