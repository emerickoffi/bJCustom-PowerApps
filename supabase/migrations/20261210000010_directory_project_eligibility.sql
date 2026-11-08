-- Directory links (project contacts and subcontractor-company links) record who works on a project.
-- They are allowed on every open project: any stage except Completed or Cancelled, and not archived.
-- Scheduling subcontractors on specific activities keeps public.project_accepts_new_assignments.

create or replace function public.project_accepts_directory_assignments(p_status text, p_archived_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_archived_at is null and coalesce(p_status, '') not in ('', 'completed', 'cancelled')
$$;

create or replace function public.subcontractor_project_assignments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project record;
  v_company record;
  v_mode text;
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

  select p.organization_id, p.status, p.archived_at into v_project from public.projects p where p.id = new.project_id;
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
  if not public.project_accepts_directory_assignments(v_project.status::text, v_project.archived_at) then
    raise exception 'Subcontractors cannot be added to completed, cancelled, or archived projects';
  end if;

  select q.assignment_mode into v_mode
    from public.subcontractor_qualification_policies q where q.organization_id = new.organization_id;
  if v_mode = 'enforcement' and public.subcontractor_qualification_status(new.subcontractor_company_id) <> 'qualified' then
    raise exception 'This subcontractor is not qualified for new project work. Complete vetting and final approval first';
  end if;

  new.created_by := auth.uid();
  new.created_at := now();
  new.ended_at := null;
  new.ended_by := null;
  new.end_reason := null;
  return new;
end;
$function$;
